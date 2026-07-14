import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { AppShell } from '@/components/shell/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ConnectButton } from '@/components/profile/ConnectButton';
import { SOCIAL_BY_ID, hrefFor, displayHandle } from '@/lib/socials';
import {
  getRelationship,
  getMutualConnections,
  describeMutuals,
} from '@/lib/server/relationship';
import { loadSharedFacets, loadCompatibility } from '@/lib/server/identity';
import type { ProfileLink, ProfileSocial } from '@/lib/types';

// Confidence → dot color for a shared read (mirrors the owner's /you view).
const READ_DOT: Record<string, string> = {
  emerging: 'bg-line',
  clear: 'bg-gold',
  strong: 'bg-sage',
};

// Text equivalent so confidence is never conveyed by color alone (WCAG 1.4.1).
const READ_CONF_LABEL: Record<string, string> = {
  emerging: 'Still forming',
  clear: 'Taking shape',
  strong: 'A clear pattern',
};

interface PublicProfile {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  tagline: string | null;
  pronouns: string | null;
  location: string | null;
  links: ProfileLink[] | null;
  socials: ProfileSocial[] | null;
  interests: string[] | null;
  down_to: string[] | null;
}

const PROFILE_COLUMNS =
  'id, display_name, handle, avatar_url, cover_url, bio, tagline, pronouns, location, links, socials, interests, down_to';

/** Handles are stored bare; tolerate a stray leading @ in the URL. */
function normalizeHandleParam(raw: string): string {
  return decodeURIComponent(raw).replace(/^@/, '').toLowerCase();
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('display_name, handle')
    .eq('handle', normalizeHandleParam(handle))
    .maybeSingle();
  if (!data) return { title: 'Profile' };
  return { title: `${data.display_name || `@${data.handle}`} on Switchboard` };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('handle', normalizeHandleParam(handle))
    .maybeSingle<PublicProfile>();
  if (!profile) notFound();

  // Your own handle → your editable profile, not this read-only view.
  if (profile.id === user.id) redirect('/profile');

  const [relationship, mutuals] = await Promise.all([
    getRelationship(supabase, user.id, profile.id),
    hasAdminCredentials()
      ? getMutualConnections(createAdminClient(), user.id, profile.id)
      : Promise.resolve({ count: 0, names: [] }),
  ]);

  // Revealed-preference facets this person opted into sharing. The RPC itself
  // gates on an accepted connection, so this is empty for anyone else; the
  // status check just avoids a needless round-trip.
  const [sharedReads, compatibility] =
    relationship.status === 'accepted'
      ? await Promise.all([
          loadSharedFacets(profile.id),
          loadCompatibility(profile.id),
        ])
      : [[], null];

  const displayName = profile.display_name || 'Someone';
  const links: ProfileLink[] = Array.isArray(profile.links) ? profile.links : [];
  const socials: ProfileSocial[] = (Array.isArray(profile.socials) ? profile.socials : []).filter(
    (s) => SOCIAL_BY_ID[s.platform],
  );
  const interests: string[] = profile.interests ?? [];
  const downTo: string[] = profile.down_to ?? [];
  const tags = [...downTo, ...interests].slice(0, 8);
  const mutualLine =
    relationship.status === 'accepted' ? "You're friends" : describeMutuals(mutuals);

  return (
    <AppShell title={displayName} back="/people">
      <div className="space-y-7">
        {/* Cover + identity */}
        <div>
          <div className="-mx-4 h-40 overflow-hidden bg-cream sm:rounded-card sm:mx-0">
            {profile.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.cover_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-brand-gradient opacity-90" />
            )}
          </div>

          <div className="relative z-10 -mt-12 flex flex-col items-center px-2 text-center">
            <Avatar
              name={displayName}
              seed={profile.id}
              src={profile.avatar_url}
              size="xl"
              ring
              className="shadow-lift ring-4"
            />
            <div className="mt-3 flex items-center gap-2">
              <h2 className="text-2xl font-extrabold tracking-tight text-ink">{displayName}</h2>
              {profile.pronouns ? (
                <span className="rounded-pill bg-cream px-2 py-0.5 text-xs font-semibold text-ink-faint">
                  {profile.pronouns}
                </span>
              ) : null}
            </div>
            {profile.handle ? (
              <p className="text-sm text-ink-faint">@{profile.handle}</p>
            ) : null}

            {profile.tagline ? (
              <p className="mt-2 text-sm font-semibold text-terracotta-deep">{profile.tagline}</p>
            ) : null}
            {profile.location ? (
              <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft">
                <Icon name="mapPin" size={14} className="text-ink-faint" />
                {profile.location}
              </p>
            ) : null}
            {profile.bio ? (
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">{profile.bio}</p>
            ) : null}

            {/* Connect + relationship context */}
            <div className="mt-4 flex flex-col items-center gap-2">
              <ConnectButton
                targetId={profile.id}
                name={displayName}
                status={relationship.status}
                connectionId={relationship.connectionId}
                size="md"
              />
              {mutualLine ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                  <Icon name="users" size={14} className="text-ink-faint" />
                  {mutualLine}
                </p>
              ) : null}
            </div>

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

        {/* Compatibility — a read computed from both your behaviors, shown only
            because you and {name} both turned it on. Neither of you sees the
            other's underlying evidence, just this result. */}
        {compatibility ? (
          <section>
            <div className="rounded-card border border-terracotta/40 bg-terracotta-soft/50 p-4">
              <h3 className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-terracotta-deep">
                <Icon name="sparkle" size={14} />
                How you two fit
              </h3>
              <p className="text-sm leading-relaxed text-ink">{compatibility.summary}</p>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                Computed from what you both do - visible because you each turned
                compatibility on.
              </p>
            </div>
          </section>
        ) : null}

        {/* Shared reads — revealed-preference signals this person chose to show
            their connections. Summary lines only; the evidence stays private. */}
        {sharedReads.length > 0 ? (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
              What {displayName.split(' ')[0]} shares
              <span className="rounded-pill bg-cream px-1.5 py-0.5 text-[10px] font-bold normal-case text-ink-faint">
                From their Read
              </span>
            </h3>
            <div className="overflow-hidden rounded-card border border-line bg-card">
              {sharedReads.map((read, i) => (
                <div
                  key={read.facet_key}
                  className={`flex items-start gap-3 px-4 py-3.5 ${
                    i > 0 ? 'border-t border-line' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      READ_DOT[read.confidence] ?? 'bg-line'
                    }`}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
                      {read.title}
                      <span className="font-semibold normal-case text-ink-faint/80">
                        · {READ_CONF_LABEL[read.confidence] ?? 'Still forming'}
                      </span>
                    </span>
                    <span className="block text-sm leading-relaxed text-ink">
                      {read.summary}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Drawn from what they actually do - shared with connections by choice.
            </p>
          </section>
        ) : null}

        {/* Links */}
        {links.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Links</h3>
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
                    <span className="block truncate font-semibold text-ink">{link.label}</span>
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
      </div>
    </AppShell>
  );
}
