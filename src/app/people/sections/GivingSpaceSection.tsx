'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { SectionHeader } from '@/components/ui/Card';
import type { SpaceRow } from './types';

interface GivingSpaceSectionProps {
  people: SpaceRow[];
  pending: boolean;
  stopGivingSpace: (person: SpaceRow) => void;
}

/**
 * Everyone the viewer gives space to (G35), friend or not — Give Space can be
 * set from any profile, so the friend list alone never showed the whole list,
 * and there was nowhere to take somebody off it who was not a friend.
 *
 * Private to its owner by construction: the page reads `profile_avoids`
 * through the viewer's own client, which RLS scopes to the avoider. The copy
 * is the same whatever the list holds — it never says anything about what the
 * people on it are doing (the Give Space invariant in docs/SECURITY.md).
 */
export function GivingSpaceSection({ people, pending, stopGivingSpace }: GivingSpaceSectionProps) {
  if (people.length === 0) return null;
  return (
    <section>
      <SectionHeader
        title="Giving space"
        hint="Only you can see this list, and nobody on it is ever told"
      />
      <p className="mb-2.5 text-xs leading-snug text-ink-faint">
        When you say yes to a plan, you get one private heads-up if someone here may be there.
        Nobody is removed or blocked.
      </p>
      <ul className="space-y-2">
        {people.map((person) => (
          <li
            key={person.id}
            className="flex items-center gap-3 rounded-card border border-line bg-card px-3.5 py-2.5"
          >
            <Avatar name={person.name} seed={person.id} size="sm" />
            <span className="min-w-0 flex-1">
              {person.handle ? (
                <Link
                  href={`/u/${encodeURIComponent(person.handle)}?from=/people`}
                  className="block truncate font-bold hover:underline underline-offset-2"
                >
                  {person.name}
                </Link>
              ) : (
                <span className="block truncate font-bold">{person.name}</span>
              )}
              {person.handle && (
                <span className="block truncate text-xs text-ink-faint">@{person.handle}</span>
              )}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => stopGivingSpace(person)}
              className="min-h-11 shrink-0 rounded-pill px-3 text-xs font-semibold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              Stop giving space
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
