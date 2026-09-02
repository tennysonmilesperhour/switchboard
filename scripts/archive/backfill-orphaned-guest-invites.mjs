// One-time repair for guest invites accepted before answering attached the
// responder's account (fixed going forward by PR #105).
//
// DRY-RUN BY DEFAULT. The dry run reports aggregate orphan counts and the
// subset whose contact matches exactly one account. It never prints tokens,
// contacts, names, or account ids.
//
//   node --env-file-if-exists=.env.local scripts/archive/backfill-orphaned-guest-invites.mjs
//   node --env-file-if-exists=.env.local scripts/archive/backfill-orphaned-guest-invites.mjs --apply
//
// Requires SUPABASE_DB_URL for a trusted direct or session-pooler Postgres
// connection. Direct SQL is deliberate: the match spans auth.users and public
// data and must run atomically, which the Data API cannot provide.

import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--apply');
const databaseUrl = process.env.SUPABASE_DB_URL;

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  process.exit(1);
}

if (!databaseUrl) {
  console.error('Missing SUPABASE_DB_URL.');
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: 'require',
});

const MATCH_CTES = `
  accounts as (
    select
      u.id as user_id,
      lower(btrim(coalesce(u.email, ''))) as auth_email,
      lower(btrim(coalesce(p.contact_email, ''))) as contact_email,
      p.contact_phone_normalized as phone
    from auth.users u
    left join public.profiles p on p.id = u.id
  ),
  matches as (
    select distinct
      i.id as invite_id,
      i.event_id,
      i.status::text as status,
      a.user_id
    from public.invites i
    join accounts a
      on i.invitee_id is null
     and i.guest_contact is not null
     and i.status::text in ('accepted', 'waitlisted', 'sent', 'expired')
     and (
          (a.auth_email <> ''
           and lower(btrim(i.guest_contact)) = a.auth_email)
       or (a.contact_email <> ''
           and lower(btrim(i.guest_contact)) = a.contact_email)
       or (a.phone is not null
           and public.normalize_phone_number(i.guest_contact) = a.phone)
     )
    where not exists (
      select 1
      from public.invites existing
      where existing.event_id = i.event_id
        and existing.invitee_id = a.user_id
    )
  ),
  match_counts as (
    select
      invite_id,
      min(user_id::text)::uuid as user_id,
      min(status) as status,
      count(distinct user_id) as account_count
    from matches
    group by invite_id
  ),
  recoverable as (
    select invite_id, user_id, status
    from match_counts
    where account_count = 1
  )
`;

async function report(executor) {
  const breakdown = await executor`
    with requested_status(status) as (
      values ('accepted'), ('waitlisted'), ('sent'), ('expired')
    ),
    contact_kind(contact_is_null) as (
      values (true), (false)
    ),
    counts as (
      select
        status::text as status,
        (guest_contact is null) as contact_is_null,
        count(*)::integer as count
      from public.invites
      where invitee_id is null
        and status::text in ('accepted', 'waitlisted', 'sent', 'expired')
      group by status::text, (guest_contact is null)
    )
    select
      s.status,
      k.contact_is_null,
      coalesce(c.count, 0)::integer as count
    from requested_status s
    cross join contact_kind k
    left join counts c
      on c.status = s.status
     and c.contact_is_null = k.contact_is_null
    order by
      array_position(array['accepted', 'waitlisted', 'sent', 'expired'], s.status),
      k.contact_is_null desc
  `;

  const matchSummary = await executor.unsafe(`
    with
    ${MATCH_CTES}
    select
      (select count(*) from recoverable)::integer as recoverable,
      (
        select count(*)
        from match_counts
        where account_count > 1
      )::integer as ambiguous,
      (
        select count(*)
        from public.invites i
        where i.invitee_id is null
          and i.guest_contact is not null
          and i.status::text in ('accepted', 'waitlisted', 'sent', 'expired')
          and not exists (
            select 1 from match_counts m where m.invite_id = i.id
          )
      )::integer as no_account_match
  `);

  console.table(breakdown);
  console.table(matchSummary);
  console.log(
    'Name-only rows (guest_contact is null) are unrecoverable by batch and are never matched.',
  );
  console.log(
    'Ambiguous contacts matching multiple accounts are skipped rather than assigning identity by guess.',
  );

  return matchSummary[0];
}

async function applyBackfill() {
  return sql.begin(async (transaction) => {
    await transaction`set transaction isolation level serializable`;
    await transaction`lock table public.invites in share row exclusive mode`;

    const updated = await transaction.unsafe(`
      with
      ${MATCH_CTES}
      update public.invites i
         set invitee_id = r.user_id
        from recoverable r
       where i.id = r.invite_id
         and i.invitee_id is null
         and not exists (
           select 1
           from public.invites existing
           where existing.event_id = i.event_id
             and existing.invitee_id = r.user_id
         )
      returning i.id
    `);

    return updated.length;
  });
}

async function run() {
  const host = new URL(databaseUrl).hostname;
  console.log(APPLY ? '=== APPLY MODE (mutating) ===' : '=== DRY RUN (no changes) ===');
  console.log(`Database host: ${host}`);

  const before = await report(sql);
  if (!APPLY) {
    console.log(
      `Dry run complete: ${before.recoverable} recoverable orphan(s). Review the counts, then pass --apply if the repair is worthwhile.`,
    );
    return;
  }

  const updated = await applyBackfill();
  console.log(`Updated ${updated} orphaned guest invite(s).`);
  console.log('Post-apply verification:');
  await report(sql);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
