import { PageSkeleton } from '@/components/shell/PageSkeleton';

export default function Loading() {
  return <PageSkeleton title="Your Read" back="/profile" variant="list" />;
}
