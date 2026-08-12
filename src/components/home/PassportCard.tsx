import Link from 'next/link';
import { Card } from '@/components/ui/Card';

interface PassportCardProps {
  earned: number;
  total: number;
  /** The next thing not yet tried, or null when everything has been. */
  nextLabel: string | null;
}

/**
 * The passport's one line on Home, for someone past the getting-started steps.
 *
 * Deliberately the smallest possible presence: one sentence and a link. The
 * card it replaces was a checklist because a brand-new user needs telling what
 * to do first; someone who has already made a plan, added a friend, and raised
 * a signal does not, and turning that into a permanent to-do list on their home
 * screen is exactly the nagging the product refuses to do.
 *
 * It disappears for good once everything has been tried — a loop that closes is
 * the point, and one that reopened every time we shipped something would be a
 * treadmill.
 */
export function PassportCard({ earned, total, nextLabel }: PassportCardProps) {
  if (total === 0 || earned === total) return null;

  return (
    <Card tone="cream">
      <Link href="/features" className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">
          <strong className="text-ink">
            You’ve tried {earned} of the {total} things Switchboard does.
          </strong>{' '}
          {nextLabel ? `Next up if you want it: ${nextLabel.toLowerCase()}.` : ''}
        </span>
        <span aria-hidden className="shrink-0 text-terracotta">
          →
        </span>
      </Link>
    </Card>
  );
}
