-- Daily digest: one quiet summary instead of a day of buzzes.
--
-- Every notification currently arrives on its own. That is right for the ones
-- that are about *now* — an invitation, a plan starting in three hours — and
-- wrong for the accumulating ones, where five separate buzzes about the same
-- room say less than one line saying five things happened.
--
-- ————————————————————————— the cadence decision —————————————————————————
--
-- Once a day, in the morning, off by default. Stated here because it is a
-- product choice and not an obvious one:
--
--   * **Once a day.** A digest that arrives twice is two interruptions, which
--     is what the digest exists to stop. Hourly would be a slower version of
--     what already happens.
--   * **Morning.** The things it summarises are plans; a summary that lands
--     after people have made their evening is a report, not a prompt.
--   * **Off by default.** Adding a new outbound message to everyone's phone
--     without asking is the wrong default even when the message is good — and
--     the people most likely to want it are the ones with enough activity to
--     find the per-item buzzes noisy, who will turn it on.
--
-- `digest_hour` is the local hour it should land, so someone in Auckland is not
-- summarised at 4pm; the sweep compares against each person's own zone.

alter table public.profiles
  add column if not exists digest_enabled boolean not null default false,
  add column if not exists digest_hour smallint not null default 8
    check (digest_hour between 0 and 23),
  -- When the last one actually went out, so a sweep that runs every hour (or
  -- twice, or after a retry) still sends at most one a day. The guarantee lives
  -- here rather than in the caller: a cron that fires twice is normal, and a
  -- duplicate digest is exactly the noise this feature exists to remove.
  add column if not exists digest_sent_at timestamptz;

create index if not exists profiles_digest_idx
  on public.profiles (digest_hour)
  where digest_enabled;

-- Which unread notifications a digest would cover, for one person.
--
-- Security definer so the sweep can run as the service role without reading the
-- notifications table wholesale, and scoped to a single user id the caller must
-- already have. It returns counts and titles the person can already see in
-- their own notification list — a digest must never become a way to learn
-- something the app would not otherwise have told them.
create or replace function public.digest_items(p_user uuid)
returns table (kind text, items integer, latest_title text)
language sql stable security definer set search_path = public as $$
  select n.kind,
         count(*)::int as items,
         (array_agg(n.title order by n.created_at desc))[1] as latest_title
  from public.notifications n
  where n.user_id = p_user
    and n.read_at is null
    -- Only what arrived since the last digest, so a person who ignores their
    -- notifications is not told about the same five things every morning.
    and n.created_at > coalesce(
      (select p.digest_sent_at from public.profiles p where p.id = p_user),
      now() - interval '7 days'
    )
  group by n.kind
  order by count(*) desc;
$$;
revoke all on function public.digest_items(uuid) from public, anon;
grant execute on function public.digest_items(uuid) to authenticated, service_role;

comment on function public.digest_items(uuid) is
  'Unread notifications since a person''s last digest, grouped by kind. Never returns anything they cannot already see in their own list.';
