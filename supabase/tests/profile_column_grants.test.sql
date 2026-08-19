begin;
select plan(10);

-- The columns the app reads back through a session (anon-key) client. SB-01
-- replaced the table-level SELECT grant on public.profiles with an explicit
-- allowlist, so any of these missing its grant makes the whole query fail —
-- and the call site cannot tell that apart from "this person has no profile".
--
-- That is not hypothetical. `appearance_theme` shipped without its grant and
-- Settings looked like it was ignoring the theme you picked; `legal_terms_*`
-- shipped without theirs and the proxy stopped funnelling half-registered
-- accounts into onboarding. Both were silent.

select column_privs_are(
  'public', 'profiles', 'appearance_theme', 'authenticated', array['SELECT'],
  'authenticated may read its own chosen appearance preset'
);
select column_privs_are(
  'public', 'profiles', 'appearance_custom', 'authenticated', array['SELECT'],
  'authenticated may read its own custom appearance'
);
select column_privs_are(
  'public', 'profiles', 'legal_terms_version', 'authenticated', array['SELECT'],
  'the proxy may read terms acceptance to decide the /legal-update bounce'
);
select column_privs_are(
  'public', 'profiles', 'onboarded', 'authenticated', array['SELECT'],
  'the proxy may read onboarding state to decide the /onboarding funnel'
);

-- Still withheld: SB-01's actual subject. A regression here is a credential
-- leak, not a cosmetic bug.
select column_privs_are(
  'public', 'profiles', 'calendar_token', 'authenticated', array[]::text[],
  'the private calendar bearer token stays off the API surface'
);
select column_privs_are(
  'public', 'profiles', 'contact_email', 'anon', array[]::text[],
  'contact email stays off the anonymous API surface'
);
select column_privs_are(
  'public', 'profiles', 'contact_phone', 'authenticated', array[]::text[],
  'contact phone stays off the API surface'
);

-- The custom appearance is a preference blob on your own row, governed by the
-- same profiles_update policy as every other preference: writable by its owner
-- and by nobody else.
select col_type_is(
  'public', 'profiles', 'appearance_custom', 'jsonb',
  'custom appearance is stored as jsonb'
);
select col_not_null(
  'public', 'profiles', 'appearance_custom',
  'custom appearance always has a value to parse'
);

-- 'custom' is a preset the column accepts, alongside the four shipped ones.
-- Asserted against the constraint definition rather than by writing a row:
-- a CHECK is only evaluated for rows an UPDATE actually touches, so a query
-- that matches nothing would pass whether or not the constraint allows it.
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
