import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { SectionHeader } from '@/components/ui/Card';
import { ConnectButton } from '@/components/profile/ConnectButton';
import {
  describeMutuals,
  type MutualConnections,
  type Relationship,
} from '@/lib/server/relationship';

export interface HostCardData {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  tagline: string | null;
}

/**
 * "Hosted by" identity card for the event page. Gives an invitee a face and a
 * name for whoever is running the plan, surfaces how they're already connected,
 * and offers a one-tap way to add them — the details the plain "You're in ✓"
 * state was missing.
 */
export function HostCard({
  host,
  relationship,
  mutuals,
}: {
  host: HostCardData;
  relationship: Relationship;
  mutuals: MutualConnections;
}) {
  const name = host.display_name || 'Your host';
  const profileHref = host.handle ? `/u/${host.handle}` : null;
  const mutualLine =
    relationship.status === 'accepted'
      ? "You're friends"
      : describeMutuals(mutuals);

  const identity = (
    <>
      <Avatar
        name={name}
        seed={host.id}
        src={host.avatar_url}
        size="md"
        ring
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-bold text-ink">
          <span className="truncate">{name}</span>
          {profileHref && (
            <Icon name="back" size={15} className="shrink-0 rotate-180 text-ink-faint" />
          )}
        </span>
        {host.handle && (
          <span className="block truncate text-xs text-ink-faint">@{host.handle}</span>
        )}
        {host.tagline && (
          <span className="block truncate text-xs text-terracotta-deep">{host.tagline}</span>
        )}
      </span>
    </>
  );

  return (
    <section>
      <SectionHeader title="Your host" />
      <div className="rounded-card border border-line bg-card p-4 shadow-lift">
        <div className="flex items-center gap-3">
          {profileHref ? (
            <Link
              href={profileHref}
              aria-label={`View ${name}’s profile`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              {identity}
            </Link>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
          )}
          <ConnectButton
            targetId={host.id}
            name={name}
            status={relationship.status}
            connectionId={relationship.connectionId}
          />
        </div>
        {mutualLine && (
          <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 text-xs font-semibold text-ink-soft">
            <Icon name="users" size={14} className="text-ink-faint" />
            {mutualLine}
          </p>
        )}
      </div>
    </section>
  );
}
