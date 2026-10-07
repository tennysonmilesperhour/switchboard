'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { GroupProgress } from '@/components/features/Passport';
import {
  FEATURES,
  FEATURE_GROUPS,
  filterFeatureGroups,
  type Feature,
} from '@/lib/features';
import { Glyph } from '@/components/ui/Glyph';

/**
 * The index is long on purpose — it's a reference, not a tour — so the search
 * box does the work of skimming. It filters on the blurb and the directions as
 * well as the title, because people arrive knowing what they want to do ("who
 * owes what") rather than what it's called.
 *
 * Result counts are spoken in text (`role="status"`), not implied by the list
 * getting shorter, so the filter reports itself to a screen reader too.
 */
export function FeatureIndexClient({
  groupProgress = null,
}: {
  /** Per-group passport tallies, or null when there's no session. */
  groupProgress?: Record<string, { earned: number; total: number }> | null;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => filterFeatureGroups(query), [query]);
  const searching = query.trim().length > 0;
  const shown = groups.reduce((total, group) => total + group.features.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="feature-search" className="sr-only">
          Search features
        </label>
        <div className="flex items-center rounded-card border border-line bg-card px-3 focus-within:border-terracotta">
          <Icon name="search" size={18} className="shrink-0 text-ink-faint" />
          <input
            id="feature-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — “who owes what”, “quiet hours”…"
            // The browser's own search-cancel button is suppressed: it sits
            // beside the labelled Clear button below and gives two unlabelled
            // ways to do the same thing.
            className="min-w-0 flex-1 bg-transparent px-2.5 py-3 text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="shrink-0 rounded-full p-1 text-ink-faint hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <p
          role="status"
          className="text-plate text-plate-inset mt-2 inline-block text-xs text-ink-faint"
        >
          {searching
            ? `${shown} of ${FEATURES.length} features match “${query.trim()}”`
            : `${FEATURES.length} things Switchboard can do`}
        </p>
      </div>

      {!searching && (
        <nav aria-label="Jump to a section" className="flex flex-wrap gap-2">
          {FEATURE_GROUPS.map((group) => (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="inline-flex items-center gap-1 rounded-pill border border-line bg-card px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:border-terracotta hover:text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              <Glyph emoji={group.emoji} size={14} />
              {group.title}
            </a>
          ))}
        </nav>
      )}

      {groups.length === 0 ? (
        <EmptyState
          emoji="🔎"
          title="Nothing matches that"
          body="Try a plainer word — “invite”, “photos”, “notifications” — or clear the search to browse everything."
        />
      ) : (
        groups.map((group) => (
          <section key={group.id} id={group.id} className="scroll-mt-20">
            <div className="mb-3 flex items-start justify-between gap-3">
              {/* `text-plate` is inert on every ordinary theme and becomes a
                  plate under a wallpaper. These headings and their hints are
                  the only text on this page with no surface of its own, which
                  is exactly the text a client photographed sitting unreadably
                  on a sky. */}
              <div className="text-plate text-plate-inset min-w-0">
                <h2 className="font-display text-xl text-ink">
                  <Glyph emoji={group.emoji} size={20} className="mr-1.5 inline align-text-bottom" />
                  {group.title}
                </h2>
                <p className="mt-0.5 text-sm text-ink-faint">{group.hint}</p>
              </div>
              {/* Only for the sections the passport actually covers; the rest
                  of the index is reference material, not a checklist. */}
              {groupProgress?.[group.id] && (
                <GroupProgress
                  earned={groupProgress[group.id].earned}
                  total={groupProgress[group.id].total}
                />
              )}
            </div>
            <div className="space-y-2.5">
              {group.features.map((feature) => (
                <FeatureRow key={feature.id} feature={feature} />
              ))}
            </div>
          </section>
        ))
      )}

      <Card tone="cream">
        <p className="text-sm leading-relaxed text-ink-soft">
          None of this switches itself on. Everything above waits until you use
          it — so the shortest way through is still to{' '}
          <Link href="/create" className="font-bold text-terracotta-deep">
            start something
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}

function FeatureRow({ feature }: { feature: Feature }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-ink">{feature.title}</h3>
        {feature.href && (
          <Icon
            name="back"
            size={18}
            className="mt-0.5 shrink-0 rotate-180 text-ink-faint"
            aria-hidden
          />
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{feature.blurb}</p>
      <p className="mt-1.5 text-xs text-ink-faint">
        <span className="font-semibold">Where:</span> {feature.where}
      </p>
    </>
  );

  // Features you reach through a plan, a room, or a wizard step have no page of
  // their own, so the card is not a link — a guessed URL would land somewhere
  // unhelpful. What it carries instead is the way IN: the screen those
  // directions start from, named and tappable. Reading "Plan wizard → Review"
  // with nothing to press is what made a client ask, apologetically, whether
  // there was a link somewhere; there is one now, and it is honest about only
  // being the first step.
  return feature.href ? (
    <Link
      href={feature.href}
      id={feature.id}
      className="block rounded-card border border-line bg-card p-4 transition-colors hover:border-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
    >
      {body}
    </Link>
  ) : (
    <div id={feature.id} className="rounded-card border border-line bg-card p-4">
      {body}
      {feature.start && (
        <Link
          href={feature.start.href}
          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-terracotta-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          Start at {feature.start.label}
          <Icon name="back" size={14} className="rotate-180" aria-hidden />
        </Link>
      )}
    </div>
  );
}
