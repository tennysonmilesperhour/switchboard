'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { setFacetPref } from '@/lib/actions/identity';
import type { DisplayFacet } from '@/lib/server/identity';
import type { Confidence } from '@/lib/engine/identity';

const CONF_STYLE: Record<Confidence, string> = {
  emerging: 'bg-cream text-ink-faint',
  clear: 'bg-gold-soft text-gold-deep',
  strong: 'bg-sage-soft text-sage-deep',
};

const CONF_LABEL: Record<Confidence, string> = {
  emerging: 'Still forming',
  clear: 'Taking shape',
  strong: 'A clear pattern',
};

export function YouClient({ facets }: { facets: DisplayFacet[] }) {
  const visible = facets.filter((f) => !f.hidden);
  const hidden = facets.filter((f) => f.hidden);

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-ink-soft">
        This is the you that Switchboard can see from what you actually do — the
        plans you say yes and no to, the circles you show up for, and how you
        feel afterward. It&apos;s a mirror only you hold. Nothing here is shared
        unless you choose to share it.
      </p>

      {visible.length === 0 && hidden.length === 0 ? (
        <EmptyState
          emoji="🪞"
          title="Nothing to reflect yet"
          body="Say yes or no to a few plans, log how they left you feeling, and your read will start to take shape here."
          action={
            <Link
              href="/plans"
              className="rounded-btn bg-brand-gradient px-4 py-2 text-sm font-bold text-white"
            >
              See your plans
            </Link>
          }
        />
      ) : null}

      {visible.map((facet) => (
        <FacetCard key={facet.key} facet={facet} />
      ))}

      {hidden.length > 0 ? (
        <details className="rounded-card border border-line bg-card/60 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-ink-faint">
            {hidden.length} hidden {hidden.length === 1 ? 'read' : 'reads'}
          </summary>
          <div className="mt-3 space-y-2">
            {hidden.map((facet) => (
              <HiddenRow key={facet.key} facet={facet} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function FacetCard({ facet }: { facet: DisplayFacet }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [shared, setShared] = useState(facet.sharedWithConnections);
  const [open, setOpen] = useState(false);

  function toggleShare() {
    const next = !shared;
    setShared(next);
    startTransition(async () => {
      const res = await setFacetPref(facet.key, { sharedWithConnections: next });
      if (!res.ok) {
        setShared(!next);
        toast.error('Could not update sharing');
      } else {
        toast.success(next ? 'Shared with your connections' : 'Back to private');
      }
    });
  }

  function hide() {
    startTransition(async () => {
      const res = await setFacetPref(facet.key, { hidden: true });
      if (!res.ok) toast.error('Could not hide this');
    });
  }

  return (
    <Card lifted className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ink">{facet.title}</h2>
        </div>
        <span
          className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold ${CONF_STYLE[facet.confidence]}`}
        >
          {CONF_LABEL[facet.confidence]}
        </span>
      </div>

      <p className="text-[15px] leading-relaxed text-ink">{facet.summary}</p>

      <FacetEvidence facet={facet} open={open} />

      <div className="flex items-center justify-between border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-ink-soft"
          aria-expanded={open}
        >
          <Icon name={open ? 'check' : 'sparkle'} size={14} />
          {open ? 'Hide the why' : 'Why you see this'}
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={hide}
            disabled={pending}
            className="text-xs font-semibold text-ink-faint hover:text-ink-soft disabled:opacity-50"
          >
            Hide
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={shared}
            aria-label="Share with connections"
            onClick={toggleShare}
            disabled={pending}
            className={`inline-flex h-6 w-10 items-center rounded-full px-0.5 transition-colors disabled:opacity-50 ${
              shared ? 'bg-sage' : 'bg-line'
            }`}
          >
            <span
              className={`size-5 rounded-full bg-card shadow-sm transition-transform ${
                shared ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
      {shared ? (
        <p className="text-[11px] text-sage-deep">
          Shared — accepted connections can see this line.
        </p>
      ) : null}
    </Card>
  );
}

function HiddenRow({ facet }: { facet: DisplayFacet }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const res = await setFacetPref(facet.key, { hidden: false });
      if (!res.ok) toast.error('Could not restore this');
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-btn bg-cream px-3 py-2">
      <span className="text-sm text-ink-soft">{facet.title}</span>
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="text-xs font-semibold text-terracotta-deep disabled:opacity-50"
      >
        Restore
      </button>
    </div>
  );
}

// ————————————————————————— evidence per facet —————————————————————————

function FacetEvidence({ facet, open }: { facet: DisplayFacet; open: boolean }) {
  if (facet.key === 'interest_alignment') {
    const aspirational = (facet.detail.aspirational as string[] | undefined) ?? [];
    const living = (facet.detail.living as string[] | undefined) ?? [];
    return (
      <div className="space-y-3">
        {aspirational.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
              Still waiting for a first outing
            </p>
            <div className="flex flex-wrap gap-1.5">
              {aspirational.map((tag) => (
                <Link
                  key={tag}
                  href={`/discover?q=${encodeURIComponent(tag)}`}
                  className="group inline-flex items-center gap-1 rounded-pill bg-terracotta-soft px-3 py-1 text-xs font-semibold text-terracotta-deep hover:bg-terracotta hover:text-white"
                >
                  {tag}
                  <Icon name="search" size={12} />
                </Link>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              Tap one to find a low-key way in.
            </p>
          </div>
        ) : null}
        {open && living.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">
              You actually show up for
            </p>
            <div className="flex flex-wrap gap-1.5">
              {living.map((tag) => (
                <span
                  key={tag}
                  className="rounded-pill bg-sage-soft px-3 py-1 text-xs font-semibold text-sage-deep"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (!open) return null;

  if (facet.key === 'energy_map') {
    const byTime = (facet.detail.byTime as Record<string, { avg: number; n: number }>) ?? {};
    const bySize = (facet.detail.bySize as Record<string, { avg: number; n: number }>) ?? {};
    return (
      <div className="space-y-2 text-xs text-ink-soft">
        <EvidenceMeters label="By time of day" buckets={byTime} />
        <EvidenceMeters label="By group size" buckets={bySize} />
        <p className="text-[11px] text-ink-faint">
          Based on {String(facet.sampleSize)} reflections after plans. Higher =
          more filled.
        </p>
      </div>
    );
  }

  if (facet.key === 'cadence') {
    const d = facet.detail;
    return (
      <ul className="space-y-1 text-xs text-ink-soft">
        <li>
          Median time to answer an invite:{' '}
          <strong className="text-ink">{fmtMinutes(d.medianResponseMinutes as number)}</strong>
        </li>
        {d.medianLeadHours !== null && d.medianLeadHours !== undefined ? (
          <li>
            Median notice before a plan you accept:{' '}
            <strong className="text-ink">{fmtHours(d.medianLeadHours as number)}</strong>
          </li>
        ) : null}
        <li className="text-[11px] text-ink-faint">
          Based on {String(facet.sampleSize)} answered invites.
        </li>
      </ul>
    );
  }

  if (facet.key === 'circle_gravity') {
    const boards = (facet.detail.boards as { name: string; posts: number; active: boolean }[]) ?? [];
    const showUpRate = facet.detail.showUpRate as number | null;
    return (
      <div className="space-y-2 text-xs text-ink-soft">
        {showUpRate !== null ? (
          <p>
            You show up for <strong className="text-ink">{showUpRate}%</strong> of
            the plans you&apos;re asked to.
          </p>
        ) : null}
        {boards.length > 0 ? (
          <ul className="space-y-1">
            {boards.map((b) => (
              <li key={b.name} className="flex items-center gap-2">
                <span
                  className={`size-1.5 rounded-full ${b.active ? 'bg-sage' : 'bg-line'}`}
                  aria-hidden
                />
                <span className="flex-1 truncate">{b.name}</span>
                <span className="text-ink-faint">
                  {b.active ? `${b.posts} post${b.posts === 1 ? '' : 's'}` : 'quiet'}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return null;
}

function EvidenceMeters({
  label,
  buckets,
}: {
  label: string;
  buckets: Record<string, { avg: number; n: number }>;
}) {
  const entries = Object.entries(buckets);
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="mb-1 font-semibold text-ink">{label}</p>
      <div className="space-y-1">
        {entries.map(([name, { avg, n }]) => {
          // Map avg feeling (−1..1) to a 0–100% bar.
          const pct = Math.round(((avg + 1) / 2) * 100);
          return (
            <div key={name} className="flex items-center gap-2">
              <span className="w-20 shrink-0 capitalize text-ink-soft">{name}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-cream">
                <span
                  className="block h-full rounded-full bg-brand-gradient"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right text-ink-faint">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 1440) return `${Math.round(m / 60)} hr`;
  return `${Math.round(m / 1440)} days`;
}

function fmtHours(h: number): string {
  if (h < 48) return `${Math.round(h)} hr`;
  return `${Math.round(h / 24)} days`;
}
