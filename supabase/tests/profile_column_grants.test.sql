begin;
select plan(13);

-- SB-01 (20260710120000) took the table-level SELECT grant off public.profiles
-- and replaced it with an explicit column allowlist. That makes the table
-- fail-closed: a column added later is unreadable until a migration names it,
-- and because a denied column fails the WHOLE query, the call site sees "no
-- profile row" rather than "you may not read that".
--
-- It has cost us twice, both times silently. `appearance_theme` shipped without
-- its grant and Settings looked like it was ignoring the theme you picked.
-- `legal_terms_version` shipped without its grant and the proxy stopped
-- funnelling half-registered accounts into onboarding.
--
-- Asserted with has_column_privilege rather than column_privs_are, which
-- compares the COMPLETE privilege set: `authenticated` also holds table-wide
-- INSERT/UPDATE (and REFERENCES, on a hosted-shaped stack), so an exact-set
-- assertion fails on privileges that have nothing to do with what is being
-- checked. What matters here is one bit per column.

-- The columns the app names in a query it runs through a session client.
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'appearance_theme', 'SELECT'),
  'authenticated may read its own chosen appearance preset'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'appearance_custom', 'SELECT'),
  'authenticated may read its own custom appearance'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'legal_terms_version', 'SELECT'),
  'the proxy may read terms acceptance to decide the /legal-update bounce'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'onboarded', 'SELECT'),
  'the proxy may read onboarding state to decide the /onboarding funnel'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'SELECT'),
  'the allowlist still covers the ordinary profile fields'
);

-- ————————————————————— the allowlist is actually in force —————————————————————
--
-- The assertions above pass just as happily when profiles has a table-wide
-- SELECT grant, because a table-level privilege covers every column. So the one
-- that matters is this: SB-01 is only doing anything while there is NO
-- table-wide SELECT grant to override it.
--
-- This is not hypothetical either. `supabase/seed.sql` used to hand
-- anon/authenticated `grant select on all tables in schema public`, which
-- restored exactly the grant SB-01 removed — so the local and CI databases have
-- never enforced the allowlist, the withheld-column assertions below could not
-- have failed, and every test in this suite ran against a database strictly more
-- permissive than production. That is also why a column missing from the
-- allowlist could ship green.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'profiles has no table-wide SELECT grant for authenticated — the allowlist governs'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'profiles has no table-wide SELECT grant for anon — the allowlist governs'
);

-- Still withheld: SB-01's actual subject. A regression here is a credential
-- leak, not a cosmetic bug. Owners read these through my_private_profile().
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'calendar_token', 'SELECT'),
  'the private calendar bearer token stays off the API surface'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'contact_email', 'SELECT'),
  'contact email stays off the API surface'
);
select ok(
  not has_column_privilege('anon', 'public.profiles', 'contact_phone', 'SELECT'),
  'contact phone stays off the anonymous API surface'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'contact_phone_normalized', 'SELECT'),
  'the phone match key stays off the API surface'
);

-- The custom appearance is a preference blob on your own row, governed by the
-- same profiles_update policy as every other preference.
select col_type_is(
  'public', 'profiles', 'appearance_custom', 'jsonb',
  'custom appearance is stored as jsonb'
);

-- 'custom' is a preset the column accepts, alongside the four shipped ones.
-- Asserted against the constraint definition rather than by writing a row: a
-- CHECK is only evaluated for rows an UPDATE actually touches, so a query that
-- matches nothing would pass whether or not the constraint allows it.
select matches(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conname = 'profiles_appearance_theme_check'
  ),
  'custom',
  'the appearance CHECK constraint admits the custom preset'
);

select * from finish();
rollback;
