import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { signOut } from '@/lib/actions/profile';
import { SOCIAL_BY_ID, hrefFor, displayHandle } from '@/lib/socials';
import { buildVCard, qrSvg } from '@/lib/vcard';
import type { SwitchboardEvent, ProfileLink, ProfileSocial } from '@/lib/types';
import { ProfileTabs, type ProfileEvent } from './ProfileTabs';
import { ProfileShare } from './ProfileShare';
import { ProfileStrength } from '@/components/profile/ProfileStrength';

export const metadata: Metadata = { title: 'Profile' };

const FEATURE_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: '/you', label: 'Your Read', icon: 'sparkle' },
  { href: '/people', label: 'People', icon: 'users' },
  { href: '/mutual', label: 'Mutual', icon: 'sparkle' },
  { href: '/moments', label: 'Moments', icon: 'chat' },
  { href: '/rooms', label: 'Rooms', icon: 'chat' },
  { href: '/zones', label: 'Zones', icon: 'mapPin' },
];

function toProfileEvent(event: SwitchboardEvent): ProfileEvent {
  return {
    id: event.id,
    title: event.title,
    starts_at: event.starts_at,
    location_name: event.location_name,
    status: event.status,
  };
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'display_name, handle, avatar_url, cover_url, bio, tagline, pronouns, location, links, socials, contact_public, interests, down_to',
    )
    .eq('id', user.id)
    .single();

  // contact_email / contact_phone are withheld from the general profiles API
  // surface; the owner reads their own via the security-definer accessor (SB-01).
  const { data: privateProfile } = await supabase
    .rpc('my_private_profile')
    .maybeSingle<{ calendar_token: string; contact_email: string | null; contact_phone: string | null }>();

  const [{ data: created }, { data: attendedRows }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('host_id', user.id)
      .order('starts_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('invites')
      .select('event:events(*)')
      .eq('invitee_id', user.id)
      .eq('status', 'accepted'),
  ]);

  const attended = (attendedRows ?? [])
    .map((row) => (Array.isArray(row.event) ? row.event[0] : row.event) as SwitchboardEvent | null)
    .filter((event): event is SwitchboardEvent => event !== null && event.host_id !== user.id)
    .map(toProfileEvent);

  const interests: string[] = profile?.interests ?? [];
  const downTo: string[] = profile?.down_to ?? [];
  const tags = [...downTo, ...interests].slice(0, 8);

  const displayName = profile?.display_name || 'You';
  const handle = profile?.handle ?? '';
  const links: ProfileLink[] = Array.isArray(profile?.links) ? profile!.links : [];
  const socials: ProfileSocial[] = (Array.isArray(profile?.socials) ? profile!.socials : []).filter(
    (s) => SOCIAL_BY_ID[s.platform],
  );
  const contactPublic = Boolean(profile?.contact_public);
  const email = privateProfile?.contact_email ?? null;
  const phone = privateProfile?.contact_phone ?? null;
  const hasContact = Boolean(email || phone);

  // vCard embeds contact details only when the user opted them into sharing.
  const vcard = buildVCard({
    displayName,
    handle,
    tagline: profile?.tagline,
    bio: profile?.bio,
    location: profile?.location,
    email: contactPublic ? email : null,
    phone: contactPublic ? phone : null,
    links,
    socials,
  });
  const qrMarkup = await qrSvg(vcard);

  return (
    <AppShell
      title="Profile"
      action={
        <Link
          href="/profile/edit"
          aria-label="Edit profile"
          className="size-9 inline-flex items-center justify-center rounded-full text-terracotta-deep hover:bg-cream"
        >
          <Icon name="edit" size={20} />
        </Link>
      }
    >
      <div className="space-y-7">
        {/* Cover + identity */}
        <div>
          <div className="-mx-4 h-40 overflow-hidden bg-cream sm:rounded-card sm:mx-0">
            {profile?.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.cover_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-brand-gradient opacity-90" />
            )}
          </div>

          {/* relative + z-10 keeps the avatar above the cover: an empty cover
              renders a gradient with opacity < 1, which forms its own stacking
              context and would otherwise paint over the overlapping avatar. */}
          <div className="relative z-10 -mt-12 flex flex-col items-center px-2 text-center">
            <Avatar
              name={displayName}
              seed={user.id}
              src={profile?.avatar_url}
              size="xl"
              ring
              className="shadow-lift ring-4"
            />
            <div className="mt-3 flex items-center gap-2">
              <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                {displayName}
              </h2>
              {profile?.pronouns ? (
                <span className="rounded-pill bg-cream px-2 py-0.5 text-xs font-semibold text-ink-faint">
                  {profile.pronouns}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-ink-faint">@{handle}</p>

            {profile?.tagline ? (
              <p className="mt-2 text-sm font-semibold text-terracotta-deep">
                {profile.tagline}
              </p>
            ) : null}
            {profile?.location ? (
              <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft">
                <Icon name="mapPin" size={14} className="text-ink-faint" />
                {profile.location}
              </p>
            ) : null}
            {profile?.bio ? (
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
                {profile.bio}
              </p>
            ) : null}

            {/* Social icons */}
            {socials.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {socials.map((social, i) => {
                  const platform = SOCIAL_BY_ID[social.platform];
                  const href = hrefFor(social.platform, social.value);
                  const inner = (
                    <span style={{ color: platform.color }}>
                      <Icon name={platform.icon} size={20} />
                    </span>
                  );
                  const cls =
                    'inline-flex size-10 items-center justify-center rounded-full border border-line bg-card shadow-sm transition-transform hover:-translate-y-0.5';
                  return href ? (
                    <a
                      key={`${social.platform}-${i}`}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${platform.label}: ${displayHandle(social.platform, social.value)}`}
                      className={cls}
                    >
                      {inner}
                    </a>
                  ) : (
                    <span
                      key={`${social.platform}-${i}`}
                      aria-label={`${platform.label}: ${social.value}`}
                      title={social.value}
                      className={cls}
                    >
                      {inner}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-pill bg-terracotta-soft px-3 py-1 text-xs font-semibold text-terracotta-deep"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Profile completion nudge — leads with photo + contact so friends
            can recognize and invite you by phone or email. */}
        <ProfileStrength
          input={{
            avatarUrl: profile?.avatar_url ?? null,
            coverUrl: profile?.cover_url ?? null,
            bio: profile?.bio ?? null,
            tagline: profile?.tagline ?? null,
            pronouns: profile?.pronouns ?? null,
            location: profile?.location ?? null,
            interests,
            downTo,
            links,
            socials,
            contactEmail: email,
            contactPhone: phone,
          }}
        />

        {/* Links */}
        {links.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
              Links
            </h3>
            <div className="overflow-hidden rounded-card border border-line bg-card">
              {links.map((link, i) => (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-cream ${
                    i > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <span className="text-terracotta">
                    <Icon name="globe" size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {link.label}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">
                      {hostFromUrl(link.url)}
                    </span>
                  </span>
                  <span className="text-ink-faint">
                    <Icon name="external" size={16} />
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {/* Contact */}
        {hasContact ? (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
              Contact
              <span
                className={`rounded-pill px-1.5 py-0.5 text-[10px] font-bold normal-case ${
                  contactPublic
                    ? 'bg-sage-soft text-sage-deep'
                    : 'bg-cream text-ink-faint'
                }`}
              >
                {contactPublic ? 'Shared' : 'Only you'}
              </span>
            </h3>
            <div className="overflow-hidden rounded-card border border-line bg-card">
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-cream"
                >
                  <span className="text-terracotta">
                    <Icon name="mail" size={20} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                    {email}
                  </span>
                </a>
              ) : null}
              {phone ? (
                <a
                  href={`tel:${phone}`}
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-cream ${
                    email ? 'border-t border-line' : ''
                  }`}
                >
                  <span className="text-terracotta">
                    <Icon name="phone" size={20} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                    {phone}
                  </span>
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Shareable QR / contact card */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
            Share
          </h3>
          <ProfileShare
            qrMarkup={qrMarkup}
            vcard={vcard}
            displayName={displayName}
            handle={handle}
            contactIncluded={contactPublic && hasContact}
          />
        </section>

        {/* Created / Attended / Activity */}
        <ProfileTabs
          created={(created ?? []).map(toProfileEvent)}
          attended={attended}
        />

        {/* Everything else */}
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
            More
          </h3>
          <div className="overflow-hidden rounded-card border border-line bg-card">
            {FEATURE_LINKS.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-cream ${
                  i > 0 ? 'border-t border-line' : ''
                }`}
              >
                <span className="text-terracotta">
                  <Icon name={link.icon} size={22} />
                </span>
                <span className="flex-1 font-semibold text-ink">{link.label}</span>
                <span className="text-ink-faint">
                  <Icon name="back" size={18} className="rotate-180" />
                </span>
              </Link>
            ))}
            <Link
              href="/settings"
              className="flex items-center gap-3 border-t border-line px-4 py-3.5 hover:bg-cream"
            >
              <span className="text-terracotta">
                <Icon name="edit" size={22} />
              </span>
              <span className="flex-1 font-semibold text-ink">Settings</span>
              <span className="text-ink-faint">
                <Icon name="back" size={18} className="rotate-180" />
              </span>
            </Link>
          </div>
        </section>

        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-btn border border-line py-3 text-sm font-bold text-ink-soft hover:bg-cream"
          >
            <Icon name="logout" size={18} />
            Sign out
          </button>
        </form>
      </div>
    </AppShell>
  );
}
