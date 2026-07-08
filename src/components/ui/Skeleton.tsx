/**
 * Loading placeholders. A single calm pulse (never a flashy shimmer) so a
 * loading screen reads as "settling in", matching the app's restful tone.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-line/80 ${className}`}
      aria-hidden
    />
  );
}

/** A stand-in for a PlanCard while the plan feed loads. */
export function PlanCardSkeleton() {
  return (
    <div className="rounded-card bg-line/50 p-5 animate-pulse" aria-hidden>
      <Skeleton className="h-3 w-24 bg-line" />
      <Skeleton className="mt-3 h-6 w-3/4 bg-line" />
      <Skeleton className="mt-4 h-3 w-1/2 bg-line" />
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
