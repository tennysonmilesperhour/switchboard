-- Verified profile facts, three discovery "selves", weights, and mood.
--
-- What this adds (all of it private by default, all of it enforced here and
-- not in the UI):
--
--   1. profile_facts / fact_vouches — where someone went to school or works,
--      with a trust tier the owner cannot write:
--        claimed  they typed it
--        email    they proved control of an address on that school's or
--                 employer's domain (written by a server action holding the
--                 service role, after a mailed link was opened)
--        vouched  two accepted connections whose own claim is email-verified
--                 for the same org confirmed it. Vouches never chain: only an
--                 email-verified fact can vouch, so one real alumnus cannot
--                 mint a ring of vouched sockpuppets.
--      The tier is authority-like state, so the table has no client write
--      grants. Reads are allowed because the facts are meant to be shown.
--
--   2. discovery_selves — three lanes (friends, dating, networking), each with
--      its own on/off, baseline "bar", audience rules and card line.
--   3. discovery_weights — 0..100 enthusiasm for each interest, activity or
--      fact, per lane. 0 means "never surface this".
--   4. discovery_mood — a temporary shift of the bar (and optionally a pause of
--      some lanes) that expires on its own. Never longer than 72 hours.
--   5. discovery_signals — private accept/pass history. Feeds suggestions and
--      hides a passed person for 30 days. Nobody else can read it.
--
-- The matching rule, in one place (private.discovery_pair):
--
--   A pair surfaces under a lane only when BOTH people have that lane on (and
--   are discoverable, off sabbatical), each satisfies the other's "seeking" and
--   "visible to" rules, and the strongest item they share (the higher of the
--   two weights' lower side) clears BOTH people's effective bars. Weights are
--   bucketed into four tiers before they are compared, and the browse function
--   returns only the shared items and a three-word "fit", never a weight, so
--   building accounts with chosen weights teaches a prober almost nothing.
--   Browsing is rate limited inside the function for the same reason.
--
-- A person in a high-bar mood is indistinguishable from a person who simply
-- does not match: nothing records or reveals a refusal. Interest sent to them
-- waits as an ordinary private mutual_intent and matches only if they later
-- reciprocate.
--
-- Existing behaviour is preserved by treating a missing "friends" row as
-- (enabled = profiles.discoverable, bar 0, audience anyone), which is exactly
-- what people discovery did before this migration.

-- ————————————————————————— verified facts —————————————————————————
create table public.profile_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('school', 'employer')),
  label text not null check (char_length(btrim(label)) between 2 and 80),
  org_key text not null check (char_length(org_key) between 2 and 80),
  tier text not null default 'claimed' check (tier in ('claimed', 'email', 'vouched')),
  verified_at timestamptz,
  shown boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, kind, org_key),
  check ((tier = 'claimed') = (verified_at is null))
);
create index profile_facts_org_idx on public.profile_facts (kind, org_key);

alter table public.profile_facts enable row level security;
-- Facts are meant to be displayed. A hidden one is visible to its owner only.
create policy profile_facts_select on public.profile_facts
  for select to authenticated
  using (shown or user_id = (select auth.uid()));
revoke all on public.profile_facts from public, anon;
grant select on public.profile_facts to authenticated;
revoke insert, update, delete on public.profile_facts from authenticated;

create table public.fact_vouches (
  fact_id uuid not null references public.profile_facts(id) on delete cascade,
  voucher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fact_id, voucher_id)
);
create index fact_vouches_voucher_idx on public.fact_vouches (voucher_id);

alter table public.fact_vouches enable row level security;
create policy fact_vouches_own_select on public.fact_vouches
  for select to authenticated
  using (voucher_id = (select auth.uid()));
revoke all on public.fact_vouches from public, anon;
grant select on public.fact_vouches to authenticated;
revoke insert, update, delete on public.fact_vouches from authenticated;

-- One mailed link per fact. Service role only, like contact_verification_requests.
create table public.fact_verification_requests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  fact_id uuid not null references public.profile_facts(id) on delete cascade,
  token_hash text not null,
  domain text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, fact_id)
);
create index fact_verification_requests_fact_idx on public.fact_verification_requests (fact_id);
create unique index fact_verification_requests_token_idx on public.fact_verification_requests (token_hash);
alter table public.fact_verification_requests enable row level security;
revoke all on public.fact_verification_requests from public, anon, authenticated;

-- ————————————————————————— owner freeze —————————————————————————
create or replace function private.freeze_discovery_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.freeze_discovery_owner() from public, anon, authenticated;

-- ————————————————————————— selves —————————————————————————
create table public.discovery_selves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  self text not null check (self in ('friends', 'dating', 'networking')),
  enabled boolean not null default false,
  bar int not null default 30 check (bar between 0 and 100),
  visible_to text not null default 'anyone'
    check (visible_to in ('anyone', 'friends_of_friends', 'verified_only')),
  seeking text not null default 'anyone'
    check (seeking in ('anyone', 'friends_of_friends', 'verified_only')),
  blurb text not null default '' check (char_length(blurb) <= 140),
  identifies_as text check (identifies_as in ('woman', 'man', 'nonbinary', 'other')),
  interested_in text[] not null default '{}'
    check (interested_in <@ array['woman', 'man', 'nonbinary', 'other']::text[]),
  updated_at timestamptz not null default now(),
  primary key (user_id, self),
  check (self = 'dating' or (identifies_as is null and interested_in = '{}'))
);
alter table public.discovery_selves enable row level security;
create policy discovery_selves_own on public.discovery_selves
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create trigger discovery_selves_freeze before update on public.discovery_selves
  for each row execute function private.freeze_discovery_owner();
revoke all on public.discovery_selves from public, anon;
grant select, insert, update, delete on public.discovery_selves to authenticated;

-- ————————————————————————— weights —————————————————————————
create table public.discovery_weights (
  user_id uuid not null references public.profiles(id) on delete cascade,
  self text not null check (self in ('friends', 'dating', 'networking')),
  item text not null check (char_length(item) between 3 and 100),
  weight int not null check (weight between 0 and 100),
  primary key (user_id, self, item)
);
alter table public.discovery_weights enable row level security;
create policy discovery_weights_own on public.discovery_weights
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create trigger discovery_weights_freeze before update on public.discovery_weights
  for each row execute function private.freeze_discovery_owner();
revoke all on public.discovery_weights from public, anon;
grant select, insert, update, delete on public.discovery_weights to authenticated;

create or replace function private.cap_discovery_weights()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.discovery_weights
       where user_id = new.user_id and self = new.self) >= 200 then
    raise exception 'too many weights for this lane' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.cap_discovery_weights() from public, anon, authenticated;
create trigger discovery_weights_cap before insert on public.discovery_weights
  for each row execute function private.cap_discovery_weights();

-- ————————————————————————— mood —————————————————————————
create table public.discovery_mood (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preset text not null default 'custom'
    check (preset in ('open', 'low_battery', 'jetlagged', 'party_only', 'custom')),
  bar_shift int not null default 0 check (bar_shift between -50 and 50),
  -- Empty means every lane stays on. Otherwise only these lanes are on.
  only_selves text[] not null default '{}'
    check (only_selves <@ array['friends', 'dating', 'networking']::text[]),
  -- Items below the bar that the person has pulled in for now.
  include_items text[] not null default '{}' check (cardinality(include_items) <= 60),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.discovery_mood enable row level security;
create policy discovery_mood_own on public.discovery_mood
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create trigger discovery_mood_freeze before update on public.discovery_mood
  for each row execute function private.freeze_discovery_owner();
revoke all on public.discovery_mood from public, anon;
grant select, insert, update, delete on public.discovery_mood to authenticated;

-- A mood always ends: nobody stays hidden by forgetting it.
create or replace function private.bound_discovery_mood()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.expires_at := least(new.expires_at, now() + interval '72 hours');
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.bound_discovery_mood() from public, anon, authenticated;
create trigger discovery_mood_bound before insert or update on public.discovery_mood
  for each row execute function private.bound_discovery_mood();

-- ————————————————————————— signals —————————————————————————
create table public.discovery_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  self text not null check (self in ('friends', 'dating', 'networking')),
  kind text not null check (kind in ('accepted', 'passed')),
  items text[] not null default '{}' check (cardinality(items) <= 12),
  created_at timestamptz not null default now()
);
create index discovery_signals_user_idx on public.discovery_signals (user_id, created_at desc);
create index discovery_signals_target_idx on public.discovery_signals (target_id);
alter table public.discovery_signals enable row level security;
create policy discovery_signals_own on public.discovery_signals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and user_id <> target_id);
revoke all on public.discovery_signals from public, anon;
grant select, insert, delete on public.discovery_signals to authenticated;
revoke update on public.discovery_signals from authenticated;

create or replace function private.prune_discovery_signals()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.discovery_signals
   where user_id = new.user_id and created_at < now() - interval '90 days';
  return null;
end $$;
revoke all on function private.prune_discovery_signals() from public, anon, authenticated;
create trigger discovery_signals_prune after insert on public.discovery_signals
  for each row execute function private.prune_discovery_signals();

-- ————————————————————————— matching helpers —————————————————————————
create or replace function private.discovery_weight_tier(p_weight int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_weight >= 80 then 90
    when p_weight >= 55 then 65
    when p_weight >= 25 then 40
    when p_weight > 0 then 10
    else 0
  end
$$;

-- A person's lane settings with the mood applied. A missing "friends" row is
-- the pre-selves behaviour: on when discoverable, no bar, anyone.
create or replace function private.discovery_effective_self(p_user uuid, p_self text)
returns table (
  enabled boolean,
  bar int,
  visible_to text,
  seeking text,
  identifies_as text,
  interested_in text[],
  blurb text
)
language sql
stable
security definer
set search_path = public
as $$
  with prof as (
    select discoverable and not coalesce(sabbatical, false) as live
    from public.profiles where id = p_user
  ),
  s as (
    select * from public.discovery_selves where user_id = p_user and self = p_self
  ),
  m as (
    select * from public.discovery_mood where user_id = p_user and expires_at > now()
  )
  select
    prof.live
      and coalesce(s.enabled, p_self = 'friends')
      and (m.user_id is null or cardinality(m.only_selves) = 0 or p_self = any(m.only_selves)),
    greatest(0, least(100,
      coalesce(s.bar, case when p_self = 'friends' then 0 else 30 end)
      + coalesce(m.bar_shift, 0))),
    coalesce(s.visible_to, 'anyone'),
    coalesce(s.seeking, 'anyone'),
    s.identifies_as,
    coalesce(s.interested_in, '{}'::text[]),
    coalesce(s.blurb, '')
  from prof
  left join s on true
  left join m on true
$$;

-- One person's enthusiasm for one item, with the mood's pulled-in items lifted.
create or replace function private.discovery_item_weight(
  p_user uuid, p_self text, p_item text, p_default int
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(w.weight, p_default) > 0
     and m.user_id is not null
     and p_item = any(m.include_items)
    then greatest(coalesce(w.weight, p_default), 80)
    else coalesce(w.weight, p_default)
  end
  from (select 1) x
  left join public.discovery_weights w
    on w.user_id = p_user and w.self = p_self and w.item = p_item
  left join public.discovery_mood m
    on m.user_id = p_user and m.expires_at > now()
$$;

create or replace function private.discovery_shares_friend(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.connections ca
    join public.connections cb
      on cb.status = 'accepted'
     and (case when cb.requester_id = p_b then cb.addressee_id else cb.requester_id end)
       = (case when ca.requester_id = p_a then ca.addressee_id else ca.requester_id end)
    where ca.status = 'accepted'
      and (ca.requester_id = p_a or ca.addressee_id = p_a)
      and (cb.requester_id = p_b or cb.addressee_id = p_b)
  )
$$;

-- Does `p_other` satisfy a "seeking"/"visible to" rule?
create or replace function private.discovery_audience_ok(p_rule text, p_subject uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_rule
    when 'friends_of_friends' then private.discovery_shares_friend(p_subject, p_other)
    when 'verified_only' then exists (
      select 1 from public.profile_facts f
      where f.user_id = p_other and f.tier <> 'claimed'
    )
    else true
  end
$$;

-- What two people share, with each side's bucketed strength. Weights stay in
-- here; callers get tiers.
create or replace function private.discovery_shared_items(p_a uuid, p_b uuid, p_self text)
returns table (item_key text, kind text, label text, fact_tier text, strength int)
language sql
stable
security definer
set search_path = public
as $$
  with a as (select interests, down_to from public.profiles where id = p_a),
  b as (select interests, down_to, discovery_interests from public.profiles where id = p_b),
  items as (
    select 'interest:' || i as item_key, 'interest' as kind, i as label,
           null::text as fact_tier, 50 as def_a, 50 as def_b
    from a, b, unnest(coalesce(a.interests, '{}'::text[])) i
    where b.discovery_interests and i = any(coalesce(b.interests, '{}'::text[]))
    union all
    select 'down_to:' || d, 'down_to', d, null::text, 50, 50
    from a, b, unnest(coalesce(a.down_to, '{}'::text[])) d
    where d = any(coalesce(b.down_to, '{}'::text[]))
    union all
    select fa.kind || ':' || fa.org_key, fa.kind, fb.label, fb.tier,
           case when fa.tier = 'claimed' then 45 else 70 end,
           case when fb.tier = 'claimed' then 45 else 70 end
    from public.profile_facts fa
    join public.profile_facts fb
      on fb.kind = fa.kind and fb.org_key = fa.org_key and fb.shown
    where fa.user_id = p_a and fb.user_id = p_b and fa.shown
  )
  select item_key, kind, label, fact_tier,
         private.discovery_weight_tier(least(
           private.discovery_item_weight(p_a, p_self, item_key, def_a),
           private.discovery_item_weight(p_b, p_self, item_key, def_b)
         )) as strength
  from items
$$;

-- The one decision. No rows = this pair does not surface under this lane.
create or replace function private.discovery_pair(p_viewer uuid, p_cand uuid, p_self text)
returns table (score int, bar int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
  c record;
  v_score int;
  v_bar int;
begin
  -- Only the caller may ask about themselves; nobody probes a third pair.
  if p_viewer is null or p_viewer is distinct from auth.uid() or p_viewer = p_cand then
    return;
  end if;

  select * into v from private.discovery_effective_self(p_viewer, p_self);
  if not found or not v.enabled then
    return;
  end if;
  select * into c from private.discovery_effective_self(p_cand, p_self);
  if not found or not c.enabled then
    return;
  end if;

  if not (
    private.discovery_audience_ok(v.seeking, p_viewer, p_cand)
    and private.discovery_audience_ok(c.visible_to, p_cand, p_viewer)
    and private.discovery_audience_ok(c.seeking, p_cand, p_viewer)
    and private.discovery_audience_ok(v.visible_to, p_viewer, p_cand)
  ) then
    return;
  end if;

  if p_self = 'dating' then
    -- Someone who has not said who they are cannot satisfy a stated preference.
    if cardinality(v.interested_in) > 0
       and (c.identifies_as is null or not (c.identifies_as = any (v.interested_in))) then
      return;
    end if;
    if cardinality(c.interested_in) > 0
       and (v.identifies_as is null or not (v.identifies_as = any (c.interested_in))) then
      return;
    end if;
  end if;

  v_bar := greatest(v.bar, c.bar);
  select coalesce(max(s.strength), 0) into v_score
  from private.discovery_shared_items(p_viewer, p_cand, p_self) s;
  if v_score < v_bar then
    return;
  end if;

  return query select v_score, v_bar;
end $$;

-- Which lane an interest belongs to. The lane rides in the activity text so
-- that a "Coffee" tapped in Dating can never cross-match a "Coffee" tapped in
-- Friends: the two taps would be different strings. Friends is the bare form,
-- which is what every interest saved before lanes existed already is.
create or replace function private.discovery_lane_of_activity(p_activity text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_activity like '% (dating)' then 'dating'
    when p_activity like '% (networking)' then 'networking'
    else 'friends'
  end
$$;

-- Is any of the caller's OWN lanes on right now? This is the only standing the
-- write path checks. It must not look at the other person: a refusal that
-- depends on someone else's mood or weights would tell a stranger tapping
-- blind what those are.
create or replace function private.discovery_lane_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from unnest(array['friends', 'dating', 'networking']) s
    where (select e.enabled from private.discovery_effective_self(p_user, s) e)
  )
$$;

-- ————————————————————————— browse —————————————————————————
create or replace function private.list_discovery_candidates(p_self text default 'friends')
returns table (
  id uuid,
  display_name text,
  handle text,
  avatar_url text,
  tagline text,
  blurb text,
  location text,
  pronouns text,
  categories text[],
  contexts text[],
  shared_interests text[],
  shared_down_to text[],
  shared_facts jsonb,
  mutual_friend_count int,
  fit text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_self not in ('friends', 'dating', 'networking') then
    return;
  end if;

  -- Browsing is the surface a prober would use to read back settings, so it is
  -- bounded here and not only in the action that calls it.
  if not public.consume_rate_limit(
    pg_catalog.md5('discovery-browse:' || v_user::text),
    90,
    60 * 60
  ) then
    raise exception 'discovery browse rate limit'
      using errcode = 'P0001', hint = 'SB-RATE-LIMIT';
  end if;

  return query
  with me as (
    select * from private.discovery_effective_self(v_user, p_self)
  ),
  mine as (
    select discovery_geography, home_latitude, home_longitude
    from public.profiles pm where pm.id = v_user
  ),
  pool as (
    select p.id, p.display_name, p.handle, p.avatar_url, p.tagline,
           p.location, p.pronouns, p.discovery_geography, p.discovery_demographics,
           p.discovery_mutuals, p.discovery_interests, p.discovery_involvements,
           p.discovery_contexts, p.down_to, p.home_latitude, p.home_longitude
    from public.profiles p
    where p.discoverable
      and p.id <> v_user
      and not coalesce(p.sabbatical, false)
      and (select enabled from me)
      and not public.are_blocked(v_user, p.id)
      and not private.is_suspended(p.id)
      and not exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and ((c.requester_id = v_user and c.addressee_id = p.id)
            or (c.requester_id = p.id and c.addressee_id = v_user))
      )
      and not exists (
        select 1 from public.discovery_signals g
        where g.user_id = v_user and g.target_id = p.id
          and g.self = p_self and g.kind = 'passed'
          and g.created_at > now() - interval '30 days'
      )
  ),
  scored as (
    select pool.*, pr.score, pr.bar
    from pool
    cross join lateral private.discovery_pair(v_user, pool.id, p_self) pr
  )
  select
    s.id, s.display_name, s.handle, s.avatar_url, s.tagline,
    (select e.blurb from private.discovery_effective_self(s.id, p_self) e),
    case when s.discovery_geography then s.location else null end,
    case when s.discovery_demographics then s.pronouns else null end,
    array_remove(array[
      case
        when s.discovery_geography
         and (select m.discovery_geography from mine m)
         and (select m.home_latitude from mine m) is not null
         and (select m.home_longitude from mine m) is not null
         and s.home_latitude is not null and s.home_longitude is not null
         and private.coarse_distance_m(
               (select m.home_latitude from mine m), (select m.home_longitude from mine m),
               s.home_latitude, s.home_longitude
             ) <= 50000
        then 'geography'
      end,
      case when s.discovery_demographics then 'demographics' end,
      case when s.discovery_interests then 'interests' end,
      case when s.discovery_involvements then 'involvements' end,
      case when s.discovery_mutuals then 'mutual friends' end
    ], null),
    case
      when cardinality(s.discovery_contexts) > 0 then s.discovery_contexts
      else coalesce(s.down_to, '{}'::text[])
    end,
    coalesce(array(
      select x.label from private.discovery_shared_items(v_user, s.id, p_self) x
      where x.kind = 'interest' and x.strength > 0 and x.strength >= s.bar
      order by x.strength desc, x.label), '{}'::text[]),
    coalesce(array(
      select x.label from private.discovery_shared_items(v_user, s.id, p_self) x
      where x.kind = 'down_to' and x.strength > 0 and x.strength >= s.bar
      order by x.strength desc, x.label), '{}'::text[]),
    coalesce((
      select jsonb_agg(jsonb_build_object('kind', x.kind, 'label', x.label, 'tier', x.fact_tier)
                       order by x.strength desc, x.label)
      from private.discovery_shared_items(v_user, s.id, p_self) x
      where x.kind in ('school', 'employer') and x.strength > 0 and x.strength >= s.bar
    ), '[]'::jsonb),
    case when s.discovery_mutuals then (
      select count(*)::int
      from public.connections ca
      join public.connections cb
        on cb.status = 'accepted'
       and (case when cb.requester_id = s.id then cb.addressee_id else cb.requester_id end)
         = (case when ca.requester_id = v_user then ca.addressee_id else ca.requester_id end)
      where ca.status = 'accepted'
        and (ca.requester_id = v_user or ca.addressee_id = v_user)
        and (cb.requester_id = s.id or cb.addressee_id = s.id)
    ) else 0 end,
    case when s.score >= 90 then 'strong' when s.score >= 65 then 'good' else 'light' end
  from scored s
  -- Strongest overlap first, then people with more mutual friends (output
  -- column 14), then name, as the original browse did.
  order by s.score desc, 14 desc, s.display_name asc
  limit 40;
end $$;

-- ————————————————————————— vouching —————————————————————————
create or replace function private.vouch_for_fact(p_fact uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  f public.profile_facts%rowtype;
  v_count int;
begin
  if v_user is null then
    return 'signed_out';
  end if;
  if not public.consume_rate_limit(
    pg_catalog.md5('fact-vouch:' || v_user::text), 30, 60 * 60
  ) then
    raise exception 'vouch rate limit' using errcode = 'P0001', hint = 'SB-RATE-LIMIT';
  end if;

  select * into f from public.profile_facts where id = p_fact and shown;
  if not found then
    return 'not_found';
  end if;
  if f.user_id = v_user then
    return 'own';
  end if;
  if public.are_blocked(v_user, f.user_id) then
    return 'not_found';
  end if;
  if not exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = v_user and c.addressee_id = f.user_id)
        or (c.requester_id = f.user_id and c.addressee_id = v_user))
  ) then
    return 'not_connected';
  end if;
  -- Only an email-verified claim to the same org can vouch for it.
  if not exists (
    select 1 from public.profile_facts mine
    where mine.user_id = v_user and mine.kind = f.kind
      and mine.org_key = f.org_key and mine.tier = 'email'
  ) then
    return 'cannot_vouch';
  end if;

  insert into public.fact_vouches (fact_id, voucher_id)
  values (p_fact, v_user)
  on conflict do nothing;

  select count(*) into v_count from public.fact_vouches where fact_id = p_fact;
  if v_count >= 2 then
    update public.profile_facts
       set tier = 'vouched', verified_at = now()
     where id = p_fact and tier = 'claimed';
  end if;
  return 'ok';
end $$;

create or replace function private.withdraw_vouch(p_fact uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count int;
begin
  if v_user is null then
    return 'signed_out';
  end if;
  delete from public.fact_vouches where fact_id = p_fact and voucher_id = v_user;
  select count(*) into v_count from public.fact_vouches where fact_id = p_fact;
  if v_count < 2 then
    update public.profile_facts
       set tier = 'claimed', verified_at = null
     where id = p_fact and tier = 'vouched';
  end if;
  return 'ok';
end $$;

-- ————————————————————————— public wrappers —————————————————————————
create or replace function public.list_discovery_candidates(p_self text default 'friends')
returns table (
  id uuid,
  display_name text,
  handle text,
  avatar_url text,
  tagline text,
  blurb text,
  location text,
  pronouns text,
  categories text[],
  contexts text[],
  shared_interests text[],
  shared_down_to text[],
  shared_facts jsonb,
  mutual_friend_count int,
  fit text
)
language sql
security invoker
set search_path = public
as $$
  select * from private.list_discovery_candidates(p_self)
$$;

create or replace function public.vouch_for_fact(p_fact uuid)
returns text
language sql
security invoker
set search_path = public
as $$
  select private.vouch_for_fact(p_fact)
$$;

create or replace function public.withdraw_vouch(p_fact uuid)
returns text
language sql
security invoker
set search_path = public
as $$
  select private.withdraw_vouch(p_fact)
$$;

-- Helpers are reachable only from other definer code. The pair function is
-- also called from the mutual_intents policy, which runs as the caller; it
-- refuses to answer about anyone but the caller.
revoke all on function
  private.discovery_weight_tier(int),
  private.discovery_effective_self(uuid, text),
  private.discovery_item_weight(uuid, text, text, int),
  private.discovery_shares_friend(uuid, uuid),
  private.discovery_audience_ok(text, uuid, uuid),
  private.discovery_shared_items(uuid, uuid, text),
  private.discovery_pair(uuid, uuid, text),
  private.discovery_lane_of_activity(text),
  private.discovery_lane_active(uuid),
  private.list_discovery_candidates(text),
  private.vouch_for_fact(uuid),
  private.withdraw_vouch(uuid)
from public, anon, authenticated;

grant execute on function
  private.discovery_pair(uuid, uuid, text),
  private.discovery_lane_of_activity(text),
  private.discovery_lane_active(uuid),
  private.list_discovery_candidates(text),
  private.vouch_for_fact(uuid),
  private.withdraw_vouch(uuid)
to authenticated, service_role;

-- service_role keeps execute on every private body (service_role_grants.test.sql),
-- including the helpers and trigger functions.
grant execute on function
  private.freeze_discovery_owner(),
  private.cap_discovery_weights(),
  private.bound_discovery_mood(),
  private.prune_discovery_signals(),
  private.discovery_weight_tier(int),
  private.discovery_effective_self(uuid, text),
  private.discovery_item_weight(uuid, text, text, int),
  private.discovery_shares_friend(uuid, uuid),
  private.discovery_audience_ok(text, uuid, uuid),
  private.discovery_shared_items(uuid, uuid, text),
  private.discovery_lane_of_activity(text)
to service_role;

revoke all on function
  public.list_discovery_candidates(text),
  public.vouch_for_fact(uuid),
  public.withdraw_vouch(uuid)
from public, anon;
grant execute on function
  public.list_discovery_candidates(text),
  public.vouch_for_fact(uuid),
  public.withdraw_vouch(uuid)
to authenticated, service_role;

-- ————————————————————————— the original browse, same rule —————————————————————————
create or replace function private.list_discoverable_people(p_category text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, display_name text, handle text, avatar_url text, tagline text, location text, pronouns text, categories text[], contexts text[], shared_interests text[], shared_down_to text[], mutual_friend_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (
    -- Empty unless the caller is themselves discoverable, which empties
    -- everything below: see and be seen.
    select id, location, interests, down_to, discovery_geography,
           home_latitude, home_longitude
    from public.profiles
    where id = auth.uid()
      and discoverable
      and not coalesce(sabbatical, false)
  ),
  my_friends as (
    select case
      when c.requester_id = auth.uid() then c.addressee_id
      else c.requester_id
    end as friend_id
    from public.connections c
    where c.status = 'accepted'
      and (c.requester_id = auth.uid() or c.addressee_id = auth.uid())
  ),
  candidate_friends as (
    select
      p.id as candidate_id,
      case
        when c.requester_id = p.id then c.addressee_id
        else c.requester_id
      end as friend_id
    from public.profiles p
    join public.connections c
      on c.status = 'accepted'
     and (c.requester_id = p.id or c.addressee_id = p.id)
    where p.discoverable
  ),
  scored as (
    select
      p.id,
      p.display_name,
      p.handle,
      p.avatar_url,
      p.tagline,
      case when p.discovery_geography then p.location else null end as location,
      case when p.discovery_demographics then p.pronouns else null end as pronouns,
      array_remove(array[
        case
          when p.discovery_geography
           and me.discovery_geography
           and me.home_latitude is not null and me.home_longitude is not null
           and p.home_latitude is not null and p.home_longitude is not null
           and private.coarse_distance_m(
                 me.home_latitude, me.home_longitude,
                 p.home_latitude, p.home_longitude
               ) <= 50000
          then 'geography'
        end,
        case when p.discovery_demographics then 'demographics' end,
        case when p.discovery_interests then 'interests' end,
        case when p.discovery_involvements then 'involvements' end,
        case when p.discovery_mutuals then 'mutual friends' end
      ], null) as categories,
      case
        when cardinality(p.discovery_contexts) > 0 then p.discovery_contexts
        else coalesce(p.down_to, '{}')
      end as contexts,
      case when p.discovery_interests
        then array(select unnest(coalesce(p.interests, '{}')) intersect select unnest(coalesce(me.interests, '{}')))
        else '{}'::text[]
      end as shared_interests,
      array(select unnest(coalesce(p.down_to, '{}')) intersect select unnest(coalesce(me.down_to, '{}'))) as shared_down_to,
      case when p.discovery_mutuals
        then (
          select count(*)::int
          from candidate_friends cf
          join my_friends mf on mf.friend_id = cf.friend_id
          where cf.candidate_id = p.id
        )
        else 0
      end as mutual_friend_count
    from public.profiles p
    cross join me
    where p.discoverable
      and p.id <> auth.uid()
      and not coalesce(p.sabbatical, false)
      and not public.are_blocked(auth.uid(), p.id)
      and not private.is_suspended(p.id)
      -- The friends lane's rules and the caller's mood apply to this older
      -- entry point too, so it cannot be used to see around them.
      and exists (select 1 from private.discovery_pair(auth.uid(), p.id, 'friends'))
      and not exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and ((c.requester_id = auth.uid() and c.addressee_id = p.id)
            or (c.requester_id = p.id and c.addressee_id = auth.uid()))
      )
  )
  select *
  from scored
  where p_category = 'all'
     or p_category = any(categories)
  order by mutual_friend_count desc, cardinality(shared_interests) desc, display_name asc
  limit 40;
$function$;

-- ————————————————————————— existing surfaces use the same rule —————————————————————————
-- Marking interest needs one of the caller's own lanes to be on (mood
-- included). It does not look at the target: the match itself is gated below,
-- silently, so a blind tap can never read someone's mood or weights back from
-- an error. With no rows written a discoverable person is a friends-lane person
-- with no bar, so nothing changes until someone opts into more.
alter policy mutual_intents_own on public.mutual_intents
  with check (
    author_id = (select auth.uid())
    and (target_id is null or not private.are_blocked((select auth.uid()), target_id))
    and (
      kind <> 'discover_connect'
      or status <> 'active'
      or exists (
        select 1
        from public.profiles me
        where me.id = (select auth.uid())
          and me.discoverable
          and not coalesce(me.sabbatical, false)
      )
    )
    and (
      kind not in ('down_to_connect', 'discover_connect')
      or status <> 'active'
      or not exists (
        select 1
        from public.profiles p
        where p.id in ((select auth.uid()), target_id)
          and coalesce(p.sabbatical, false)
      )
    )
    and (
      kind not in ('down_to_connect', 'discover_connect')
      or status <> 'active'
      or not (
        private.is_suspended((select auth.uid()))
        or (target_id is not null and private.is_suspended(target_id))
      )
    )
    and (
      kind <> 'discover_connect'
      or status <> 'active'
      or private.discovery_lane_active((select auth.uid()))
    )
  );

-- A discovery match forms only when the pair clears the lanes' rules as the
-- tapper sees them. If it does not, the interest simply keeps waiting: the
-- tapper is told nothing, and a later tap (after the other person's mood or
-- settings let them through) matches normally. Everything else in this
-- function is exactly as 20260709140000_discovery_matching.sql left it.
create or replace function private.check_mutual_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mirror public.mutual_intents%rowtype;
  v_room uuid;
begin
  select * into v_mirror from public.mutual_intents
    where author_id = new.target_id
      and target_id = new.author_id
      and activity = new.activity
      and kind = new.kind
      and status = 'active'
      and (
        kind in ('down_to_connect', 'discover_connect')
        or event_id is not distinct from new.event_id
      )
    limit 1
    for update;

  if found
     and (
       new.kind <> 'discover_connect'
       or auth.uid() is null
       or exists (
         select 1 from private.discovery_pair(
           new.author_id, new.target_id,
           private.discovery_lane_of_activity(new.activity)
         )
       )
     ) then
    insert into public.rooms (kind, title, created_by)
      values ('match', new.activity, new.author_id)
      returning id into v_room;
    insert into public.room_members (room_id, member_id)
      values (v_room, new.author_id), (v_room, new.target_id);
    insert into public.matches (user_a, user_b, activity, kind, event_id, room_id)
      values (least(new.author_id, new.target_id), greatest(new.author_id, new.target_id),
              new.activity, new.kind, new.event_id, v_room);
    update public.mutual_intents set status = 'matched' where id in (new.id, v_mirror.id);
  end if;
  return new;
end $$;
revoke all on function private.check_mutual_match() from public, anon, authenticated;
grant execute on function private.check_mutual_match() to service_role;
