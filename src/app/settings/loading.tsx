import { PageSkeleton } from '@/components/shell/PageSkeleton';

export default function Loading() {
  return <PageSkeleton title="Settings" back="/profile" variant="list" />;
}
