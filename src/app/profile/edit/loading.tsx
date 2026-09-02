import { PageSkeleton } from '@/components/shell/PageSkeleton';

export default function Loading() {
  return <PageSkeleton title="Edit profile" back="/profile" variant="list" />;
}
