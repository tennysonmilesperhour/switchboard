import { Glyph } from '@/components/ui/Glyph';
import { POLL_REVEAL_FLOOR } from '@/lib/engine/scoring';

/**
 * One row of `poll_results()`. Below `POLL_REVEAL_FLOOR` contributing voters
 * (20261017120000) the numbers are null and `revealed` is false: with two
 * voters, either one could subtract their own ballot and read the other's.
 * `leads` marks the one clear leader, and below the floor only once the poll
 * is decided.
 */
export interface OptionResult {
  option_id: string;
  score: number | null;
  loves: number | null;
  objections: number | null;
  voters: number | null;
  revealed: boolean;
  leads: boolean;
}

/** 0-100 from an option's totals; 0 when there are none to show. */
export function consensusOf(result: OptionResult | undefined): number {
  if (!result?.voters || result.score === null) return 0;
  return Math.round(((result.score / result.voters + 1) / 3) * 100);
}

/**
 * What a poll says in place of its totals below the floor. Nobody gets
 * numbers then, the host included; once decided, the clear leader is marked.
 */
export function PollFloorNote({
  votingOpen,
  decided,
  hasLeader,
}: {
  votingOpen: boolean;
  decided: boolean;
  hasLeader: boolean;
}) {
  const className = 'mb-4 rounded-card bg-cream px-3 py-2 text-xs text-ink-soft';
  if (votingOpen) {
    return (
      <p className={className}>
        <Glyph emoji="🔒" size={12} className="inline -mt-0.5 mr-1" />
        Totals show once {POLL_REVEAL_FLOOR} people have rated ideas. Until then nobody, the host
        included, sees how it is leaning, so no one can work out a single person’s vote.
      </p>
    );
  }
  if (!decided) return null;
  return (
    <p className={className}>
      Fewer than {POLL_REVEAL_FLOOR} people voted, so the totals stay hidden.{' '}
      {hasLeader ? 'The idea marked Leading came out ahead.' : 'No single idea came out ahead.'}
    </p>
  );
}
