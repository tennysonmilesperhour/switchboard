'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/format';
import { reviewVenue } from '@/lib/actions/venues';
import { Glyph } from '@/components/ui/Glyph';

export interface PendingVenue {
  id: string;
  name: string;
  area: string | null;
  perk: string;
  url: string | null;
  claimed_by: string;
  claimant_name: string | null;
  created_at: string;
}

/** Only surface http(s) links to the moderator — never a javascript: href. */
function externalHref(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    return null;
  }
  return null;
}

export function PendingVenuesClient({ venues }: { venues: PendingVenue[] }) {
  return (
    <ul className="space-y-3">
      {venues.map((venue) => (
        <li key={venue.id}>
          <VenueClaimCard venue={venue} />
        </li>
      ))}
    </ul>
  );
}

function VenueClaimCard({ venue }: { venue: PendingVenue }) {
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const href = externalHref(venue.url);

  function act(decision: 'verified' | 'rejected') {
    startTransition(async () => {
      const result = await reviewVenue(venue.id, decision, note);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update the claim.', result.code);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <p className="text-sm">
        <span className="font-bold">{venue.name}</span>
        {venue.area && <span className="text-ink-soft"> · {venue.area}</span>}
      </p>
      <p className="mt-1.5 rounded-card bg-cream p-3 text-sm text-ink-soft break-words">
        <Glyph emoji="🎁" size={14} className="mr-1 inline align-text-bottom" />{venue.perk}
      </p>
      <p className="mt-1.5 text-xs text-ink-soft">
        Claimed by {venue.claimant_name ?? 'a member'} · {formatRelative(venue.created_at)}
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs font-medium text-terracotta-deep hover:underline underline-offset-4 break-all"
        >
          {href} ↗
        </a>
      ) : (
        <p className="mt-1 text-xs text-ink-faint">No website provided.</p>
      )}
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Review note (optional)"
        aria-label="Review note"
        className="mt-3 w-full rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => act('verified')}>
          Verify
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => act('rejected')}
        >
          Reject
        </Button>
      </div>
    </Card>
  );
}
