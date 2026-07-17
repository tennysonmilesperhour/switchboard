-- A profile that has accepted the legal terms and community covenant has
-- completed the onboarding form. Repair any row that saved those acknowledgments
-- but was left with onboarded=false, which would otherwise loop the user back
-- through onboarding after they had already finished it.

update public.profiles
set onboarded = true
where onboarded = false
  and legal_terms_accepted_at is not null
  and community_covenant_accepted_at is not null;
