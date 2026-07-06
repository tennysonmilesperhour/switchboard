import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { SOCIAL_BY_ID } from '@/lib/socials';
import type { ProfileLink, ProfileSocial } from '@/lib/types';
import { ProfileEditForm } from './ProfileEditForm';

export const metadata: Metadata = { title: 'Edit profile' };

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'display_name, handle, avatar_url, cover_url, bio, tagline, pronouns, location, links, socials, contact_email, contact_phone, contact_public',
    )
    .eq('id', user.id)
    .single();

  const links: ProfileLink[] = Array.isArray(profile?.links) ? profile!.links : [];
  const socials: ProfileSocial[] = (Array.isArray(profile?.socials) ? profile!.socials : []).filter(
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
        links={links}
        socials={socials}
        contactEmail={profile?.contact_email ?? ''}
        contactPhone={profile?.contact_phone ?? ''}
        contactPublic={Boolean(profile?.contact_public)}
      />
    </AppShell>
  );
}
