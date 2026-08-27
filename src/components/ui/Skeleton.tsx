import { PLAN_CARD_FULL_MIN_H, PLAN_CARD_TILE_ASPECT } from './PlanCard';

/**
 * Loading placeholders. A single calm pulse (never a flashy shimmer) so a
 * loading screen reads as "settling in", matching the app's restful tone.
 *
 * A placeholder's job is to hold the space its content will take. When it holds
 * less, the arriving content shoves the page down — and on iOS that shove is
 * what starts the URL-bar collapse, so the whole layout animates. The plan-card
 * placeholders therefore take their geometry from `PlanCard` itself rather than
 * from numbers typed twice.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton-surface animate-pulse rounded-lg bg-line/80 ${className}`}
      aria-hidden
    />
  );
}

/**
 * A stand-in for a PlanCard while the plan feed loads, in the same two shapes
 * the real card comes in: the tall `full` card the feed uses, and the `tile`
 * the plans grid uses.
 *
 * The pulse lives only on the outer surface. Nesting a pulsing bar inside a
 * pulsing card multiplies the two opacity curves, so the inner bars beat
 * against the card at a second frequency.
 */
export function PlanCardSkeleton({
  variant = 'full',
}: {
  variant?: 'full' | 'tile';
}) {
  if (variant === 'tile') {
    return (
      <div
        className={`${PLAN_CARD_TILE_ASPECT} skeleton-surface animate-pulse rounded-card bg-line/50 p-3.5`}
        aria-hidden
      />
    );
  }
  return (
    <div
      className={`${PLAN_CARD_FULL_MIN_H} skeleton-surface animate-pulse rounded-card bg-line/50 p-6`}
      aria-hidden
    >
      <div className="h-3 w-24 rounded-lg bg-line" />
      <div className="mt-3 h-6 w-3/4 rounded-lg bg-line" />
      <div className="mt-4 h-3 w-1/2 rounded-lg bg-line" />
    </div>
  );
}

/** A stand-in for a list of Cards (people, rooms, boards, …). */
export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-card border border-line bg-card p-4"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A stand-in for a grid of plan tiles (the plans page). */
export function PlanGridSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3" aria-hidden>
      {Array.from({ length: tiles }).map((_, i) => (
        <PlanCardSkeleton key={i} variant="tile" />
      ))}
    </div>
  );
}
