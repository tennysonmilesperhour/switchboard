'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { claimVenue } from '@/lib/actions/venues';
import { errorRef, type ErrorCode } from '@/lib/errors';

export interface VenueRow {
  id: string;
  name: string;
  area: string | null;
  perk: string;
  url: string | null;
}

export type VenueStatus = 'pending' | 'verified' | 'rejected';

export interface VenueClaim extends VenueRow {
  status: VenueStatus;
}

/** Accept only http(s) links, so a claimed `url` can't smuggle a javascript: href. */
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

const STATUS_CHIP: Record<VenueStatus, { label: string; className: string }> = {
  pending: { label: '⏳ Pending review', className: 'bg-gold-soft text-ink-soft' },
  verified: { label: '✓ Verified partner', className: 'bg-sage-soft text-ink-soft' },
  rejected: { label: 'Not approved', className: 'bg-rose-soft text-rose-deep' },
};

function VenueCard({ venue }: { venue: VenueRow }) {
  const href = externalHref(venue.url);
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">
          {venue.name}
          {venue.area && (
            <span className="text-xs text-ink-faint font-normal"> · {venue.area}</span>
          )}
        </p>
        <span className="shrink-0 rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
          ✓ Verified
        </span>
      </div>
      <p className="text-sm text-ink-soft mt-0.5">🎁 {venue.perk}</p>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-xs font-medium text-terracotta-deep hover:underline underline-offset-4"
        >
          Visit website ↗
        </a>
      )}
    </Card>
  );
}

export function VenuePerks({
  venues,
  myClaims = [],
}: {
  venues: VenueRow[];
  myClaims?: VenueClaim[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [perk, setPerk] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Verified claims already show in the public list above, so the "your
  // submissions" strip only needs to surface the ones still in or out of review.
  const openClaims = myClaims.filter((claim) => claim.status !== 'verified');

  return (
    <section>
      <SectionHeader
        title="Partner perks 🏪"
        hint="Verified local spots that offer Switchboard groups a perk"
        action={
          <button
            type="button"
            onClick={() => {
              setShowForm((current) => !current);
              setSubmitted(false);
            }}
            className="text-xs font-medium text-terracotta-deep hover:underline underline-offset-4"
          >
            {showForm ? 'Close' : 'Claim your venue'}
          </button>
        }
      />
      {venues.length === 0 && !showForm && openClaims.length === 0 && (
        <Card tone="cream">
          <p className="text-sm text-ink-soft leading-relaxed">
            No verified partner spots yet. Run a place people love? Claim it and
            offer a perk — we review each submission to confirm it&apos;s really
            the business before it goes live, so groups can trust it.
          </p>
        </Card>
      )}
      {venues.length > 0 && (
        <div className="space-y-2">
          {venues.map((venue) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </div>
      )}

      {openClaims.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">
            Your submissions
          </p>
          <div className="space-y-2">
            {openClaims.map((claim) => {
              const chip = STATUS_CHIP[claim.status];
              return (
                <Card key={claim.id} tone="cream">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold">
                      {claim.name}
                      {claim.area && (
                        <span className="text-xs text-ink-faint font-normal"> · {claim.area}</span>
                      )}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.className}`}
                    >
                      {chip.label}
                    </span>
                  </div>
                  <p className="text-sm text-ink-soft mt-0.5">🎁 {claim.perk}</p>
                  {claim.status === 'pending' && (
                    <p className="mt-1 text-xs text-ink-faint">
                      A moderator is reviewing this. It appears publicly once verified.
                    </p>
                  )}
                  {claim.status === 'rejected' && (
                    <p className="mt-1 text-xs text-ink-faint">
                      This claim wasn&apos;t approved. Reach out if you think that&apos;s a mistake.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <Card className="mt-3 animate-rise">
          {submitted ? (
            <div className="space-y-1.5 text-center py-2">
              <p className="text-2xl" aria-hidden>📨</p>
              <p className="text-sm font-bold text-ink">Submitted for review</p>
              <p className="text-xs text-ink-soft leading-relaxed">
                We&apos;ll verify it&apos;s really the business and publish the perk
                once it checks out. You can track it under “Your submissions”.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-ink-soft leading-relaxed">
                Claiming a spot submits it for review — we confirm it&apos;s really
                the business before the perk shows to groups.
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Venue name (exactly as guests would type it)"
                aria-label="Venue name"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Neighborhood or city"
                aria-label="Venue area"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Business website (so we can verify it's you)"
                aria-label="Business website"
                inputMode="url"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <input
                value={perk}
                onChange={(e) => setPerk(e.target.value)}
                placeholder="The perk (reserved table, 10% off pitchers…)"
                aria-label="Venue perk"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              {error && (
                <p role="alert" className="text-xs text-rose-deep">
                  {error}
                  {errorCode && <span className="ml-2 opacity-70">{errorRef(errorCode)}</span>}
                </p>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError('');
                    setErrorCode(null);
                    const result = await claimVenue(name, area, perk, url);
                    if (!result.ok) {
                      setError(result.error ?? 'Could not submit');
                      setErrorCode(result.code ?? null);
                      return;
                    }
                    setName('');
                    setArea('');
                    setPerk('');
                    setUrl('');
                    setSubmitted(true);
                    router.refresh();
                  })
                }
              >
                Submit for review
              </Button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
