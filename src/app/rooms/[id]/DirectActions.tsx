'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { savedContactPhone } from '@/lib/client/saved-contact-phones';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/**
 * The two ways out of a conversation that started from a status.
 *
 * Make a plan is always there: it opens the plan form with this person already
 * invited and the status as the working title. Text instead appears only when
 * the reader shared their own contacts with Switchboard and this person was one
 * of them, so the number came from the reader's own address book and lives on
 * this device (see `saved-contact-phones.ts`). It is a plain `sms:` link that
 * hands off to the phone's messaging app; Switchboard never sends the text.
 */
export function DirectActions({
  peer,
  planTitle,
}: {
  peer: { id: string; name: string };
  planTitle: string;
}) {
  const phone = useSyncExternalStore(
    subscribe,
    () => savedContactPhone(peer.id),
    () => null,
  );
  const planHref = `/events/new?invite=${peer.id}&title=${encodeURIComponent(planTitle)}`;

  return (
    <div className="flex gap-2 pt-2" data-testid="direct-actions">
      <Link
        href={planHref}
        className="flex min-h-11 flex-1 items-center justify-center rounded-pill bg-brand-gradient px-4 text-sm font-bold text-white shadow-lift active:scale-[0.98]"
      >
        Make a plan
      </Link>
      {phone && (
        <a
          href={`sms:${phone}`}
          aria-label={`Text ${peer.name} instead, from your phone`}
          className="flex min-h-11 items-center justify-center rounded-pill border border-line bg-card px-4 text-sm font-bold text-ink hover:border-terracotta"
        >
          Text instead
        </a>
      )}
    </div>
  );
}
