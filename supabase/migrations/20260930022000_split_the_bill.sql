-- Split the bill: a pinned payer, chosen participants, and a settled state
-- (G3, G31; D21).
--
-- ————————————————————————— G3: the payer is pinned —————————————————————————
--
-- `expenses_insert` (20260704140000_wave2.sql) checked the logger and their
-- membership, but not `payer_id`, so a member could record that anybody at all
-- — someone outside the room, someone who had never heard of it — paid, and
-- the ledger would tell everyone they were owed. D21 lets a member log what
-- another member paid (that is how a group ledger is kept), so the rule is:
-- the payer must be a member of the same room. The same policy refuses a write
-- into a room a block has closed (20260930020000_room_blocks_and_controls.sql).
--
-- There is no UPDATE policy on expenses, and that stays true: an edit changes
-- everyone's shares, so it goes through `save_expense`, which lets only the
-- person who logged it or the person who paid change it, and rewrites the
-- shares in the same transaction. Delete keeps its policy (logger or payer).
--
-- ————————————————————————— G31: shares —————————————————————————
--
-- The room used to divide every expense evenly by however many people were in
-- the room when you looked, so someone joining later retroactively owed a slice
-- of a dinner they never ate, and nobody could say "this one was just the three
-- of us". Each expense now carries its shares: who is in on it and for how
-- many cents, written only by definer code so the shares always add up to the
-- amount. A share can be settled (paid back), which takes it out of the
-- balances without deleting the history. Existing expenses are backfilled with
-- the even split they were already showing.
--
-- USD only for now (D21); amounts are integer cents.

alter policy expenses_insert on public.expenses
  with check (
    created_by = auth.uid()
    and private.is_room_member(room_id, auth.uid())
    and private.is_room_member(room_id, payer_id)
    and not private.room_closed_by_block(room_id, auth.uid())
  );

create table if not exists public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  share_cents integer not null check (share_cents >= 0),
  settled_at timestamptz,
  settled_by uuid references public.profiles(id) on delete set null,
  primary key (expense_id, member_id)
);

create index if not exists expense_shares_room_idx on public.expense_shares (room_id);
create index if not exists expense_shares_member_idx on public.expense_shares (member_id);
create index if not exists expense_shares_settled_by_idx on public.expense_shares (settled_by);

alter table public.expense_shares enable row level security;

drop policy if exists expense_shares_select on public.expense_shares;
create policy expense_shares_select on public.expense_shares
  for select to authenticated
  using (private.is_room_member(room_id, (select auth.uid())));

-- Readable by the room, writable by nobody through the API: the definer
-- functions below are the only writers, which is what keeps every expense's
-- shares summing to its amount.
revoke all on public.expense_shares from anon, authenticated;
grant select on public.expense_shares to authenticated;

-- ————————————————————————— writing shares —————————————————————————
-- An even split of p_amount across p_members, the odd cents going to the first
-- members in id order so the shares always sum to the amount. A share whose
-- amount is unchanged keeps its settled state; a changed one is owed again.
create or replace function private.write_expense_shares(
  p_expense uuid,
  p_room uuid,
  p_amount integer,
  p_members uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer := coalesce(array_length(p_members, 1), 0);
begin
  delete from public.expense_shares s
  where s.expense_id = p_expense
    and not (s.member_id = any (coalesce(p_members, '{}'::uuid[])));

  if v_count = 0 then
    return;
  end if;

  insert into public.expense_shares as s (expense_id, room_id, member_id, share_cents)
  select
    p_expense,
    p_room,
    ordered.member_id,
    (p_amount / v_count)
      + case when ordered.rn <= (p_amount % v_count) then 1 else 0 end
  from (
    select u.member_id, row_number() over (order by u.member_id) as rn
    from (select distinct unnest(p_members) as member_id) u
  ) ordered
  on conflict (expense_id, member_id) do update
    set room_id = excluded.room_id,
        share_cents = excluded.share_cents,
        settled_at = case
          when s.share_cents = excluded.share_cents then s.settled_at
          else null
        end,
        settled_by = case
          when s.share_cents = excluded.share_cents then s.settled_by
          else null
        end;
end;
$$;

revoke all on function private.write_expense_shares(uuid, uuid, integer, uuid[])
  from public, anon, authenticated;
grant execute on function private.write_expense_shares(uuid, uuid, integer, uuid[]) to service_role;

-- An expense written directly (the insert policy above) is split across the
-- whole room, which is what the ledger has always meant by default.
create or replace function private.default_expense_shares()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_expense_shares(
    new.id,
    new.room_id,
    new.amount_cents,
    array(
      select m.member_id from public.room_members m
      where m.room_id = new.room_id
      order by m.member_id
    )
  );
  return null;
end;
$$;

revoke all on function private.default_expense_shares() from public, anon, authenticated;
grant execute on function private.default_expense_shares() to service_role;

drop trigger if exists expenses_default_shares on public.expenses;
create trigger expenses_default_shares
  after insert on public.expenses
  for each row execute function private.default_expense_shares();

-- Backfill: the even split every existing expense was already being shown as.
do $$
declare
  v_expense record;
begin
  for v_expense in
    select e.id, e.room_id, e.amount_cents
    from public.expenses e
    where not exists (
      select 1 from public.expense_shares s where s.expense_id = e.id
    )
  loop
    perform private.write_expense_shares(
      v_expense.id,
      v_expense.room_id,
      v_expense.amount_cents,
      array(
        select m.member_id from public.room_members m
        where m.room_id = v_expense.room_id
        order by m.member_id
      )
    );
  end loop;
end $$;

-- ————————————————————————— add or edit —————————————————————————
create or replace function private.save_expense(
  p_room uuid,
  p_description text,
  p_amount_cents integer,
  p_payer uuid,
  p_participants uuid[],
  p_expense uuid default null,
  p_settle_url text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_description text := btrim(coalesce(p_description, ''));
  v_members uuid[];
  v_existing public.expenses%rowtype;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.is_room_member(p_room, v_user) then
    raise exception 'only people in this room can add to its ledger'
      using errcode = '42501';
  end if;
  if private.room_closed_by_block(p_room, v_user) then
    raise exception 'this room is read-only' using errcode = '42501';
  end if;
  if char_length(v_description) not between 1 and 120 then
    raise exception 'describe the expense in 1 to 120 characters'
      using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 100000000 then
    raise exception 'the amount must be between $0.01 and $1,000,000'
      using errcode = '22023';
  end if;
  if p_settle_url is not null and p_settle_url !~* '^https?://' then
    raise exception 'a settle-up link must be a web address' using errcode = '22023';
  end if;
  if p_payer is null or not private.is_room_member(p_room, p_payer) then
    raise exception 'the person who paid must be in this room' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
    into v_members
  from unnest(coalesce(p_participants, '{}'::uuid[])) as x
  where x is not null;

  if coalesce(array_length(v_members, 1), 0) = 0 then
    raise exception 'choose at least one person to split with' using errcode = '22023';
  end if;
  if array_length(v_members, 1) > 200 then
    raise exception 'too many people to split with' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_members) as x
    where not private.is_room_member(p_room, x)
  ) then
    raise exception 'everyone splitting must be in this room' using errcode = '42501';
  end if;

  if p_expense is null then
    insert into public.expenses (room_id, description, amount_cents, payer_id, settle_url, created_by)
    values (p_room, v_description, p_amount_cents, p_payer, p_settle_url, v_user)
    returning id into v_id;
  else
    select * into v_existing
    from public.expenses e
    where e.id = p_expense
    for update;
    if not found or v_existing.room_id <> p_room then
      raise exception 'that expense is not in this room' using errcode = 'P0002';
    end if;
    if v_user <> v_existing.created_by and v_user <> v_existing.payer_id then
      raise exception 'only the person who logged it or who paid can change it'
        using errcode = '42501';
    end if;

    update public.expenses
       set description = v_description,
           amount_cents = p_amount_cents,
           payer_id = p_payer,
           settle_url = p_settle_url
     where id = p_expense;

    -- Paid back to whom? A settlement was with the old payer, so a new payer
    -- means every share is owed again.
    if v_existing.payer_id <> p_payer then
      update public.expense_shares
         set settled_at = null, settled_by = null
       where expense_id = p_expense;
    end if;
    v_id := p_expense;
  end if;

  perform private.write_expense_shares(v_id, p_room, p_amount_cents, v_members);
  return v_id;
end;
$$;

revoke all on function private.save_expense(uuid, text, integer, uuid, uuid[], uuid, text)
  from public, anon, authenticated;
grant execute on function private.save_expense(uuid, text, integer, uuid, uuid[], uuid, text)
  to authenticated, service_role;

create or replace function public.save_expense(
  p_room uuid,
  p_description text,
  p_amount_cents integer,
  p_payer uuid,
  p_participants uuid[],
  p_expense uuid default null,
  p_settle_url text default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.save_expense(
    p_room, p_description, p_amount_cents, p_payer, p_participants, p_expense, p_settle_url
  );
$$;

revoke all on function public.save_expense(uuid, text, integer, uuid, uuid[], uuid, text)
  from public, anon;
grant execute on function public.save_expense(uuid, text, integer, uuid, uuid[], uuid, text)
  to authenticated;

-- ————————————————————————— settle up —————————————————————————
-- Everything still owed between the caller and one other person in this room,
-- in either direction, is marked paid back. Either of the two may record it —
-- the balance is theirs, and nobody else's is touched.
create or replace function private.settle_up(p_room uuid, p_other uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_other is null or p_other = v_user then
    raise exception 'choose the person you are settling up with' using errcode = '22023';
  end if;
  if not private.is_room_member(p_room, v_user) then
    raise exception 'only people in this room can settle its ledger'
      using errcode = '42501';
  end if;
  if private.room_closed_by_block(p_room, v_user) then
    raise exception 'this room is read-only' using errcode = '42501';
  end if;

  update public.expense_shares s
     set settled_at = now(), settled_by = v_user
    from public.expenses e
   where e.id = s.expense_id
     and e.room_id = p_room
     and s.room_id = p_room
     and s.settled_at is null
     and (
       (e.payer_id = v_user and s.member_id = p_other)
       or (e.payer_id = p_other and s.member_id = v_user)
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.settle_up(uuid, uuid) from public, anon, authenticated;
grant execute on function private.settle_up(uuid, uuid) to authenticated, service_role;

create or replace function public.settle_up(p_room uuid, p_other uuid)
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.settle_up(p_room, p_other);
$$;

revoke all on function public.settle_up(uuid, uuid) from public, anon;
grant execute on function public.settle_up(uuid, uuid) to authenticated;

-- ————————————————————————— live updates (G12) —————————————————————————
-- Room members see a new or edited expense, and a settled share, without
-- reloading. RLS (expenses_select / expense_shares_select) decides who receives
-- each change, so nothing outside the room is delivered. Guarded so a re-run is
-- a no-op.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expense_shares'
  ) then
    alter publication supabase_realtime add table public.expense_shares;
  end if;
end $$;
