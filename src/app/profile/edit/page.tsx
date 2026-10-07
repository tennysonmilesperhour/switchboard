import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { SOCIAL_BY_ID } from '@/lib/socials';
import { parseProfileLinks, parseProfileSocials } from '@/lib/supabase/json';
import { ProfileEditForm } from './ProfileEditForm';
import { FactsEditor, type EditableFact } from './FactsEditor';

export const metadata: Metadata = { title: 'Edit profile' };

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ fact?: string | string[] }>;
}) {
  const { fact: factParam } = await searchParams;
  const factNotice = Array.isArray(factParam) ? factParam[0] : factParam;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'display_name, handle, avatar_url, cover_url, bio, tagline, pronouns, location, links, socials, contact_public',
    )
    .eq('id', user.id)
    .single();

  // contact_email / contact_phone are withheld from the general profiles API
  // surface; the owner reads their own via the security-definer accessor (SB-01).
  const { data: privateProfile } = await supabase
    .rpc('my_private_profile')
    .maybeSingle<{ calendar_token: string; contact_email: string | null; contact_phone: string | null }>();
  const { data: homePoint } = await supabase
    .rpc('my_home_point')
    .maybeSingle<{ latitude: number; longitude: number }>();

  // The owner reads all of their own entries, hidden ones included
  // (`profile_facts_select`). Writes go through server actions only.
  const { data: factRows } = await supabase
    .from('profile_facts')
    .select('id, kind, label, tier, shown')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  const facts: EditableFact[] = (factRows ?? []).map((row) => ({
    id: row.id,
    kind: row.kind === 'employer' ? 'employer' : 'school',
    label: row.label,
    tier: row.tier === 'email' || row.tier === 'vouched' ? row.tier : 'claimed',
    shown: row.shown,
  }));

  const links = parseProfileLinks(profile?.links ?? []);
  const socials = parseProfileSocials(profile?.socials ?? []).filter(
    (s) => SOCIAL_BY_ID[s.platform],
  );

  return (
    <AppShell title="Edit profile" back="/profile">
      <ProfileEditForm
        userId={user.id}
        displayName={profile?.display_name ?? ''}
        handle={profile?.handle ?? ''}
        avatarUrl={profile?.avatar_url ?? null}
        coverUrl={profile?.cover_url ?? null}
        bio={profile?.bio ?? ''}
        tagline={profile?.tagline ?? ''}
        pronouns={profile?.pronouns ?? ''}
        location={profile?.location ?? ''}
        homePoint={
          homePoint
            ? { lat: homePoint.latitude, lng: homePoint.longitude }
            : null
        }
        links={links}
        socials={socials}
        contactEmail={privateProfile?.contact_email ?? ''}
        contactPhone={privateProfile?.contact_phone ?? ''}
        contactPublic={Boolean(profile?.contact_public)}
      />
      <FactsEditor facts={facts} notice={factNotice ?? null} />
    </AppShell>
  );
}
