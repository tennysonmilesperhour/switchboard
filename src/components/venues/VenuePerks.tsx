'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { claimVenue, updateVenueClaim, withdrawVenueClaim } from '@/lib/actions/venues';
import { errorFor, errorRef, type ErrorCode } from '@/lib/errors';

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
  /** The reviewer's note, once decided. The claimant can read their own. */
  review_note?: string | null;
  reviewed_at?: string | null;
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

const INPUT_CLASS =
  'w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta';

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
          className="mt-1.5 inline-flex min-h-11 items-center text-xs font-medium text-terracotta-deep hover:underline underline-offset-4"
        >
          Visit website ↗
        </a>
      )}
    </Card>
  );
}

/** One of the reader's own claims: its status, the reviewer's note, and what they can do. */
function ClaimCard({ claim, supportEmail }: { claim: VenueClaim; supportEmail: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(claim.name);
  const [area, setArea] = useState(claim.area ?? '');
  const [perk, setPerk] = useState(claim.perk);
  const [url, setUrl] = useState(claim.url ?? '');
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const chip = STATUS_CHIP[claim.status];

  function save() {
    startTransition(async () => {
      const result = await updateVenueClaim(claim.id, { name, area, perk, url });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save that change.', result.code);
        return;
      }
      toast.success(
        result.backToReview
          ? 'Saved. It’s back in review, since a verified perk is checked again after changes.'
          : 'Saved.',
      );
      setEditing(false);
      router.refresh();
    });
  }

  async function withdraw() {
    // Ask before the transition starts. Updates made inside an async
    // transition are held until the whole action settles, so a dialog opened
    // in there never paints and the action waits on an answer nobody can give.
    const ok = await confirm({
      title: `Withdraw ${claim.name}?`,
      body:
        claim.status === 'verified'
          ? 'The perk stops showing to groups straight away. You can claim the venue again later.'
          : 'The claim is removed. You can submit it again later.',
      confirmLabel: 'Withdraw',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await withdrawVenueClaim(claim.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not withdraw that claim.', result.code);
        return;
      }
      toast.success('Withdrawn.');
      router.refresh();
    });
  }

  const appealHref = `mailto:${supportEmail}?subject=${encodeURIComponent(
    `Appeal: venue claim for ${claim.name}`,
  )}`;

  return (
    <Card tone="cream" aria-busy={pending}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">
          {claim.name}
          {claim.area && <span className="text-xs text-ink-faint font-normal"> · {claim.area}</span>}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.className}`}>
          {chip.label}
        </span>
      </div>
      <p className="text-sm text-ink-soft mt-0.5">🎁 {claim.perk}</p>
      {claim.status === 'pending' && (
        <p className="mt-1 text-xs text-ink-faint">
          A moderator is reviewing this. You’ll get a notification and an email with
          the outcome.
        </p>
      )}
      {claim.status !== 'pending' && claim.review_note && (
        <p className="mt-1.5 text-xs text-ink-soft">
          <span className="font-bold">Reviewer’s note:</span> “{claim.review_note}”
        </p>
      )}
      {claim.status === 'rejected' && (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
          If you think that’s a mistake, reply to the review email to appeal, or{' '}
          <a href={appealHref} className="font-semibold text-terracotta-deep underline">
            write to {supportEmail}
          </a>
          . Say what would confirm the business is yours.
        </p>
      )}

      {editing ? (
        <div className="mt-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Venue name" className={INPUT_CLASS} />
          <input value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} aria-label="Venue area" placeholder="Neighborhood or city" className={INPUT_CLASS} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={300} aria-label="Business website" inputMode="url" className={INPUT_CLASS} />
          <input value={perk} onChange={(e) => setPerk(e.target.value)} maxLength={200} aria-label="Venue perk" className={INPUT_CLASS} />
          {claim.status === 'verified' && (
            <p className="text-xs text-ink-faint">
              Saving a change sends the perk back for a quick re-check before it shows again.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={save}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1">
          {claim.status !== 'rejected' && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-pill px-2 text-xs font-bold text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={withdraw}
            disabled={pending}
            className="inline-flex min-h-11 items-center rounded-pill px-2 text-xs font-semibold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            Withdraw
          </button>
        </div>
      )}
    </Card>
  );
}

export function VenuePerks({
  venues,
  myClaims = [],
  area = null,
  loadError = null,
  supportEmail,
}: {
  venues: VenueRow[];
  myClaims?: VenueClaim[];
  /** The viewer's area the list is scoped to (D14), or null when they have none. */
  area?: string | null;
  loadError?: ErrorCode | null;
  /** Where an appeal goes: the configured support address. */
  supportEmail: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [claimArea, setClaimArea] = useState('');
  const [perk, setPerk] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <section id="perks" className="scroll-mt-20">
      <SectionHeader
        title="Partner perks 🏪"
        hint={area ? `Verified spots near ${area} with a perk for Switchboard groups` : 'Verified local spots that offer Switchboard groups a perk'}
        action={
          <button
            type="button"
            onClick={() => {
              setShowForm((current) => !current);
              setSubmitted(false);
            }}
            className="inline-flex min-h-11 items-center text-xs font-medium text-terracotta-deep hover:underline underline-offset-4"
          >
            {showForm ? 'Close' : 'Claim your venue'}
          </button>
        }
      />

      {loadError ? (
        <Card>
          <ErrorNotice message={errorFor(loadError).message} fix={errorFor(loadError).fix} code={loadError} />
        </Card>
      ) : !area ? (
        <Card tone="cream">
          <p className="text-sm text-ink-soft leading-relaxed">
            Perks are shown for the area you’re in. Add your city or neighborhood to{' '}
            <Link href="/profile/edit" className="font-semibold text-terracotta-deep underline">
              your profile
            </Link>{' '}
            to see verified spots near you.
          </p>
        </Card>
      ) : venues.length === 0 ? (
        !showForm && (
          <Card tone="cream">
            <p className="text-sm text-ink-soft leading-relaxed">
              No verified partner spots near {area} yet. Run a place people love?
              Claim it and offer a perk — we review each submission to confirm
              it&apos;s really the business before it goes live, so groups can trust it.
            </p>
          </Card>
        )
      ) : (
        <div className="space-y-2">
          {venues.map((venue) => (
            <VenueCard key={venue.id} venue={venue} />
          ))}
        </div>
      )}

      {myClaims.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">
            Your claims
          </p>
          <div className="space-y-2">
            {myClaims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} supportEmail={supportEmail} />
            ))}
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
                once it checks out. You&apos;ll get a notification and an email with
                the outcome, and you can track it under “Your claims”.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-ink-soft leading-relaxed">
                Claiming a spot submits it for review — we confirm it&apos;s really
                the business before the perk shows to groups in its area.
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Venue name (exactly as guests would type it)"
                aria-label="Venue name"
                className={INPUT_CLASS}
              />
              <input
                value={claimArea}
                onChange={(e) => setClaimArea(e.target.value)}
                maxLength={80}
                placeholder="Neighborhood or city"
                aria-label="Venue area"
                className={INPUT_CLASS}
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={300}
                placeholder="Business website (so we can verify it's you)"
                aria-label="Business website"
                inputMode="url"
                className={INPUT_CLASS}
              />
              <input
                value={perk}
                onChange={(e) => setPerk(e.target.value)}
                maxLength={200}
                placeholder="The perk (reserved table, 10% off pitchers…)"
                aria-label="Venue perk"
                className={INPUT_CLASS}
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
                    const result = await claimVenue(name, claimArea, perk, url);
                    if (!result.ok) {
                      setError(result.error ?? 'Could not submit');
                      setErrorCode(result.code ?? null);
                      return;
                    }
                    setName('');
                    setClaimArea('');
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
