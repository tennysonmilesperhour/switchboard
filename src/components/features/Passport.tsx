import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import {
  PASSPORT_STEPS,
  passportProgress,
  type PassportState,
} from '@/lib/passport';

/**
 * Your own record of what you've tried, at the top of the feature index.
 *
 * A loop worth closing, and nothing more than that: private, silent, and made
 * only of things that already happened. It names the next thing to try, never
 * the number outstanding — "3 to go" is a debt, "here's one you haven't tried"
 * is an invitation, and the difference is the whole reason this is allowed to
 * exist in a product whose principles ban growth-hacking.
 */
export function Passport({ state }: { state: PassportState }) {
  const { earned, total, done, next } = passportProgress(state);

  return (
    <Card tone={done ? 'sage' : 'cream'} className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-lg text-ink">
          {done ? 'You’ve tried all of it 🎉' : 'What you’ve tried'}
        </p>
        <p className="shrink-0 text-sm font-bold text-ink-soft">
          {earned} of {total}
        </p>
      </div>

      {/* Nine small marks rather than a percentage bar: a stamp reads as
          something you collected, a percentage reads as a completion quota. */}
      <ul className="flex flex-wrap gap-1.5" aria-hidden>
        {PASSPORT_STEPS.map((step) => (
          <li
            key={step.id}
            className={`size-2.5 rounded-full ${
              state[step.id] ? 'bg-sage' : 'bg-line'
            }`}
          />
        ))}
      </ul>

      <p className="sr-only">
        You have tried {earned} of {total} parts of Switchboard.
      </p>

      {done ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          Every part of Switchboard, met at least once. There’s a theme waiting
          for you in{' '}
          <Link href="/settings" className="font-bold text-terracotta-deep">
            Appearance
          </Link>
          .
        </p>
      ) : next ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          Not tried yet:{' '}
          <Link href={next.href} className="font-bold text-terracotta-deep">
            {next.label.toLowerCase()}
          </Link>
          . {next.hint}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * The per-section tally shown beside a feature group's heading. Silent when a
 * group has no stamps in it — most of the index is reference material, not a
 * checklist, and pretending otherwise would turn a catalogue into homework.
 */
export function GroupProgress({
  earned,
  total,
}: {
  earned: number;
  total: number;
}) {
  return (
    <span
      className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-bold ${
        earned === total ? 'bg-sage-soft text-sage-deep' : 'bg-cream text-ink-faint'
      }`}
    >
      {earned === total ? '✓ tried' : `${earned}/${total} tried`}
    </span>
  );
}
