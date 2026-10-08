import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { safeNextPath } from '@/lib/security';
import { WALKTHROUGHS, WALKTHROUGHS_HOME, walkthroughById } from '@/lib/walkthroughs';
import { WalkthroughPlayer } from '@/components/walkthroughs/WalkthroughPlayer';

export function generateStaticParams() {
  return WALKTHROUGHS.map((tour) => ({ id: tour.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tour = walkthroughById(id);
  return { title: tour ? tour.title : 'Walkthrough' };
}

/**
 * One walkthrough, played full screen. Everything on the stage is made up, so
 * the page reads nothing about the viewer; the proxy still keeps it behind
 * sign-in like the rest of the app.
 *
 * `next` is where Skip and Finish go — Home after onboarding, otherwise back to
 * the list on the feature index. `first` marks the run straight after sign-up.
 */
export default async function TourPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ next?: string; first?: string }>;
}) {
  const { id } = await params;
  const { next, first } = await searchParams;
  const tour = walkthroughById(id);
  if (!tour) notFound();

  return (
    <WalkthroughPlayer
      tour={tour}
      exitHref={safeNextPath(next, WALKTHROUGHS_HOME)}
      first={first === '1'}
    />
  );
}
