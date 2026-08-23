import { AppShell } from './AppShell';
import {
  Skeleton,
  PlanCardSkeleton,
  PlanGridSkeleton,
  CardListSkeleton,
} from '@/components/ui/Skeleton';

interface PageSkeletonProps {
  title?: string;
  back?: string;
  /** 'feed' = a tall plan card + a list; 'list' = just a list; 'detail' = a hero
   *  block + a list; 'grid' = the two-column plan tile grid. Defaults to 'feed'. */
  variant?: 'feed' | 'list' | 'detail' | 'grid';
}

/**
 * Route-level loading placeholder rendered inside the normal app chrome, so a
 * slow page settles in with the header and tab bar already in place rather than
 * flashing a blank screen. Used by every query-heavy route's loading.tsx.
 *
 * Each variant reserves at least a viewport of height. That is the point of the
 * thing: a placeholder shorter than its content lets the arriving page grow
 * under the reader, and on iOS a document that crosses from "fits one screen"
 * to "scrollable" starts the URL-bar collapse, so everything on screen moves at
 * once. Exact parity is impossible here — the feed is 0 to 4 cards and most
 * sections below it are conditional — so the goal is only that the page is
 * already scrollable on the first frame and never crosses that boundary.
 */
export function PageSkeleton({ title, back, variant = 'feed' }: PageSkeletonProps) {
  return (
    <AppShell title={title} back={back}>
      <div className="space-y-6">
        {variant === 'detail' ? (
          <>
            <PlanCardSkeleton />
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <CardListSkeleton rows={3} />
          </>
        ) : variant === 'list' ? (
          <>
            <Skeleton className="h-8 w-1/2" />
            <CardListSkeleton rows={5} />
          </>
        ) : variant === 'grid' ? (
          <>
            <Skeleton className="h-8 w-1/2" />
            <PlanGridSkeleton tiles={4} />
            <CardListSkeleton rows={2} />
          </>
        ) : (
          <>
            {!title && <Skeleton className="h-9 w-1/2" />}
            <PlanCardSkeleton />
            <CardListSkeleton rows={3} />
          </>
        )}
      </div>
    </AppShell>
  );
}
