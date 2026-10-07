import { Glyph } from '@/components/ui/Glyph';
import { Card } from '@/components/ui/Card';

interface DecidedStep {
  id: string;
  question: string;
  winner: string | null;
}

interface PendingStep {
  id: string;
  question: string;
}

interface PollChainProps {
  decided: DecidedStep[];
  pending: PendingStep[];
  activeQuestion: string;
  activeDecided: boolean;
  eventId: string;
  isHost: boolean;
}

/**
 * The shape of a group's decision, in order: what's settled, what's being asked
 * now, and what opens next.
 *
 * Only one question is ever votable at a time, which is the point — a plan that
 * asked "when", "where", and "what are we eating" all at once would be the
 * group text it exists to replace. This strip is what makes the sequencing
 * legible: it says the earlier answers are locked in, and that the next
 * question arrives by itself rather than needing anyone to chase it.
 */
export function PollChain({
  decided,
  pending,
  activeQuestion,
  activeDecided,
}: PollChainProps) {
  if (decided.length === 0 && pending.length === 0) return null;

  return (
    <Card tone="cream" className="space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">
        Deciding together
      </p>

      <ol className="space-y-2">
        {decided.map((step) => (
          <li key={step.id} className="flex items-start gap-2 text-sm">
            <span aria-hidden className="mt-0.5 text-sage-deep">
              <Glyph emoji="✓" size={14} />
            </span>
            <span className="min-w-0">
              <span className="text-ink-faint">{step.question}</span>{' '}
              {step.winner && <strong className="text-ink">{step.winner}</strong>}
            </span>
          </li>
        ))}

        <li className="flex items-start gap-2 text-sm">
          <span aria-hidden className="mt-0.5">
            {activeDecided ? <Glyph emoji="✓" size={14} /> : '→'}
          </span>
          <span className="min-w-0 font-bold text-ink">{activeQuestion}</span>
        </li>

        {pending.map((step) => (
          <li key={step.id} className="flex items-start gap-2 text-sm">
            <span aria-hidden className="mt-0.5 text-ink-faint">
              <Glyph emoji="○" size={14} />
            </span>
            <span className="min-w-0 text-ink-faint">
              {step.question}
              <span className="block text-xs">
                Opens once the question above is settled
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
