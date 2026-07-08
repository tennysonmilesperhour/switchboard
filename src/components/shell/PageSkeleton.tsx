import { AppShell } from './AppShell';
import { Skeleton, PlanCardSkeleton, CardListSkeleton } from '@/components/ui/Skeleton';

interface PageSkeletonProps {
  title?: string;
  back?: string;
  /** 'feed' = a couple of plan cards + a list; 'list' = just a list; 'detail'
   *  = a hero block + a list. Defaults to 'feed'. */
  variant?: 'feed' | 'list' | 'detail';
}

/**
 * Route-level loading placeholder rendered inside the normal app chrome, so a
 * slow page settles in with the header and tab bar already in place rather than
 * flashing a blank screen. Used by every query-heavy route's loading.tsx.
 */
export function PageSkeleton({ title, back, variant = 'feed' }: PageSkeletonProps) {
  return (
    <AppShell title={title} back={back}>
      <div className="space-y-6">
        {variant === 'detail' ? (
          <>
            <Skeleton className="h-40 w-full rounded-card" />
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
        ) : (
          <>
            {!title && <Skeleton className="h-9 w-1/2" />}
            <PlanCardSkeleton />
            <PlanCardSkeleton />
            <CardListSkeleton rows={3} />
          </>
        )}
      </div>
    </AppShell>
  );
}
