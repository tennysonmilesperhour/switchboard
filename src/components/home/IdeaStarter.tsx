'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PlanCard, planColor } from '@/components/ui/PlanCard';

const STORAGE_KEY = 'sb:home-ideas-view';

type View = 'cards' | 'compact';

/**
 * The empty-Home "float an idea" surface. Past `maxChips` ideas it defaults to
 * large cards you swipe through; the toggle drops it to a compact banner with
 * chips, and the choice is remembered on this device. Storage is only a
 * convenience, so every access is guarded and the default always renders.
 */
export function IdeaStarter({
  ideas,
  maxChips,
}: {
  ideas: string[];
  maxChips: number;
}) {
  const canSwipe = ideas.length > maxChips;
  const [view, setView] = useState<View>(canSwipe ? 'cards' : 'compact');

  useEffect(() => {
    if (!canSwipe) return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'cards' || saved === 'compact') setView(saved);
    } catch {
      // Private window or blocked storage: keep the default.
    }
  }, [canSwipe]);

  function choose(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembering is fine.
    }
  }

  const showCards = canSwipe && view === 'cards';

  return (
    <div className="space-y-3">
      {canSwipe ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => choose(showCards ? 'compact' : 'cards')}
            aria-pressed={showCards}
            className="rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink-soft shadow-lift active:scale-[0.98] transition-all"
          >
            {showCards ? 'Show smaller' : 'Show large cards'}
          </button>
        </div>
      ) : null}

      {showCards ? (
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Plan ideas, swipe to browse"
        >
          <div className="w-[85%] shrink-0 snap-center">
            <Link href="/events/new" className="block">
              <PlanCard
                title="Float an idea to your people"
                color="pink"
                attendeesLabel="Swipe for ideas, or start from scratch."
                actions={
                  // A solid surface with the theme's own ink: white text on a
                  // quarter-white pill over the pink card fell below 4.5:1.
                  <span className="rounded-btn bg-card px-5 py-2.5 text-sm font-bold text-ink shadow-lift">
                    Start something
                  </span>
                }
              />
            </Link>
          </div>
          {ideas.map((idea, i) => (
            <div key={idea} className="w-[85%] shrink-0 snap-center">
              <PlanCard
                href={`/events/new?title=${encodeURIComponent(idea)}`}
                title={idea}
                color={planColor(i + 1)}
                attendeesLabel="Tap to start this plan"
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          <Link
            href="/events/new"
            className="plan-pink flex items-center gap-3 rounded-card p-4 text-white shadow-card active:scale-[0.99] transition-transform"
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-extrabold leading-tight tracking-tight">
                Float an idea to your people
              </h3>
              <p className="mt-0.5 text-sm font-semibold text-white/85">
                Pick something below, or start from scratch.
              </p>
            </div>
            <span className="shrink-0 rounded-btn bg-card px-4 py-2 text-sm font-bold text-ink shadow-lift">
              Start
            </span>
          </Link>
          <div className="flex flex-wrap gap-2" aria-label="Quick plan ideas">
            {ideas.map((idea) => (
              <Link
                key={idea}
                href={`/events/new?title=${encodeURIComponent(idea)}`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-sm font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                {idea}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
