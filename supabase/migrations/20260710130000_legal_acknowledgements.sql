alter table public.profiles
  add column if not exists legal_terms_version text,
  add column if not exists legal_terms_accepted_at timestamptz,
  add column if not exists community_covenant_accepted_at timestamptz;
