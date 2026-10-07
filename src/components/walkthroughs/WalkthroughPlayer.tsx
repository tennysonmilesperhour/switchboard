'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';
import { tryItFor, type Walkthrough } from '@/lib/walkthroughs';
import { SceneClock } from './scene-kit';
import { TOUR_SCENES } from './TourScenes';

/**
 * Plays one walkthrough: a staged screen that fills itself in, a caption, and
 * Next. The reader never has to do anything but read and tap Next; Skip is on
 * every frame, so this is never something to get out of (docs/AUTH.md: no
 * state is a dead end, and the first-run tour sits right after onboarding).
 *
 * Arrow keys step too. Replay restarts the current scene's animation.
 */
export function WalkthroughPlayer({
  tour,
  exitHref,
  first = false,
}: {
  tour: Walkthrough;
  /** Where Skip and Finish go. */
  exitHref: string;
  /** Straight after sign-up: the wording welcomes rather than explains. */
  first?: boolean;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Bumped by Replay so the scene remounts and its clock starts over.
  const [run, setRun] = useState(0);
  const step = tour.steps[index];
  const last = index === tour.steps.length - 1;
  const Scene = TOUR_SCENES[step.scene];
  const tryIt = tryItFor(step);

  const go = useCallback(
    (delta: number) => {
      const target = index + delta;
      if (target < 0) return;
      if (target >= tour.steps.length) {
        router.push(exitHref);
        return;
      }
      setIndex(target);
      setRun(0);
    },
    [index, tour.steps.length, router, exitHref],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return;
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  return (
    <div className="mx-auto flex min-h-[100svh] max-w-lg flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <header className="flex items-center gap-3">
        <p className="text-plate text-plate-inset flex min-w-0 flex-1 items-center gap-1.5 text-sm font-bold text-ink-soft">
          <Glyph emoji={tour.emoji} size={16} className="shrink-0 text-terracotta" />
          <span className="truncate">{first ? 'Welcome to Switchboard' : tour.title}</span>
        </p>
        <Link
          href={exitHref}
          className="shrink-0 rounded-pill px-3 py-1.5 text-sm font-bold text-ink-soft hover:bg-cream hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          {first ? 'Skip tour' : 'Close'}
        </Link>
      </header>

      {/* One segment per step; the current one fills as you arrive on it. */}
      <div
        className="mt-3 flex gap-1"
        role="progressbar"
        aria-label="Walkthrough progress"
        aria-valuemin={1}
        aria-valuemax={tour.steps.length}
        aria-valuenow={index + 1}
        aria-valuetext={`Step ${index + 1} of ${tour.steps.length}`}
      >
        {tour.steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setIndex(i);
              setRun(0);
            }}
            aria-label={`Go to step ${i + 1}: ${s.title}`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            <span
              className={`block h-full rounded-full bg-terracotta transition-[width] duration-500 ease-out ${
                i <= index ? 'w-full' : 'w-0'
              }`}
            />
          </button>
        ))}
      </div>

      {/* The stage is a picture of the app; the caption below carries the
          meaning, so screen readers skip the made-up screen. */}
      <div className="mt-4 flex flex-1 items-center justify-center" aria-hidden>
        <SceneClock key={`${step.id}-${run}`}>
          <div className="w-full">
            <Scene />
          </div>
        </SceneClock>
      </div>

      <section key={step.id} className="animate-rise mt-4 [@media(min-height:740px)]:mt-5 [@media(min-height:740px)]:min-h-[10.5rem]" aria-live="polite">
        <p className="text-plate text-plate-inset text-xs font-bold uppercase tracking-wide text-terracotta-deep">
          {index + 1} of {tour.steps.length}
        </p>
        <h1 className="text-plate text-plate-inset mt-1 text-2xl font-extrabold tracking-tight text-ink">
          {step.title}
        </h1>
        <p className="text-plate text-plate-inset mt-1.5 text-[15px] leading-relaxed text-ink-soft">
          {step.caption}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            className="inline-flex items-center gap-1 text-xs font-bold text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            <Icon name="play" size={12} aria-hidden /> Replay
          </button>
          {!first && tryIt && (
            <Link
              href={tryIt.href}
              className="inline-flex items-center gap-1 text-xs font-bold text-terracotta-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              Try it: {tryIt.label}
              <Icon name="back" size={12} className="rotate-180" aria-hidden />
            </Link>
          )}
        </div>
      </section>

      <nav aria-label="Walkthrough steps" className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-btn border border-line bg-card text-ink transition-opacity hover:border-terracotta disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          aria-label="Back"
        >
          <Icon name="back" size={20} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          autoFocus
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-btn bg-brand-gradient text-base font-bold text-white shadow-lift transition-all hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          {last ? (first ? 'Start using Switchboard' : 'Done') : 'Next'}
          {!last && <Icon name="back" size={18} className="rotate-180" aria-hidden />}
        </button>
      </nav>
    </div>
  );
}
