'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import {
  addSuggestion,
  castVote,
  closeVoting,
  openVoting,
  pickWinner,
} from '@/lib/actions/polls';
import type { Weight } from '@/lib/engine/scoring';
import type { Poll, PollOption } from '@/lib/types';

export interface OptionResult {
  option_id: string;
  score: number;
  loves: number;
  objections: number;
  voters: number;
}

interface PollSectionProps {
  poll: Poll;
  options: PollOption[];
  results: OptionResult[];
  myVotes: Record<string, Weight>;
  isHost: boolean;
  eventId: string;
}

const WEIGHT_BUTTONS: Array<{ weight: Weight; emoji: string; label: string }> = [
  { weight: 2, emoji: '😍', label: 'Absolutely love this' },
  { weight: 1, emoji: '🙂', label: 'Sounds good' },
  { weight: -1, emoji: '🙅', label: "I'd rather not" },
];

function consensusOf(result: OptionResult | undefined): number {
  if (!result || result.voters === 0) return 0;
  return Math.round(((result.score / result.voters + 1) / 3) * 100);
}

export function PollSection({
  poll,
  options,
  results,
  myVotes,
  isHost,
  eventId,
}: PollSectionProps) {
  const [suggestion, setSuggestion] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Live consensus: a DB trigger bumps polls.tally_version on every vote change.
  // Subscribe to this poll's row and re-fetch aggregates so the meter moves as
  // others vote, without ever exposing an individual vote.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`poll-${poll.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'polls',
          filter: `id=eq.${poll.id}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [poll.id, router]);

  const resultFor = (optionId: string) =>
    results.find((r) => r.option_id === optionId);

  const ranked = [...options].sort((a, b) => {
    const ra = resultFor(a.id);
    const rb = resultFor(b.id);
    return (
      (rb?.score ?? 0) - (ra?.score ?? 0) ||
      (ra?.objections ?? 0) - (rb?.objections ?? 0) ||
      (rb?.loves ?? 0) - (ra?.loves ?? 0)
    );
  });

  const leader = ranked[0] ? resultFor(ranked[0].id) : undefined;
  const groupConsensus = consensusOf(leader);
  const winner = poll.winning_option_id
    ? options.find((o) => o.id === poll.winning_option_id)
    : null;
  const votingOpen = poll.phase === 'suggesting' || poll.phase === 'voting' || poll.phase === 'runoff';

  function submitSuggestion(e: React.FormEvent) {
    e.preventDefault();
    const label = suggestion;
    setSuggestion('');
    startTransition(async () => {
      const result = await addSuggestion(poll.id, eventId, label);
      if (!result.ok) setError(result.error ?? 'Could not add that');
      else router.refresh();
    });
  }

  function vote(optionId: string, weight: Weight) {
    startTransition(async () => {
      // Tapping the same weight again clears it back to neutral.
      const next: Weight = myVotes[optionId] === weight ? 0 : weight;
      const result = await castVote(poll.id, eventId, optionId, next);
      if (!result.ok) setError(result.error ?? 'Vote failed');
      else router.refresh();
    });
  }

  return (
    <section aria-labelledby="poll-heading">
      <SectionHeader
        title="What should we do?"
        hint={
          poll.phase === 'decided'
            ? 'The group has decided.'
            : poll.phase === 'runoff'
              ? 'Final runoff - pick between the finalists.'
              : 'Rank ideas privately. Nobody sees your individual votes.'
        }
      />

      {/* Consensus meter - aggregate only, never individual votes */}
      {votingOpen && results.some((r) => r.voters > 0) && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-bold text-ink-soft uppercase tracking-wide">Group consensus</span>
            <span className="font-extrabold text-sage-deep">{groupConsensus}%</span>
          </div>
          <div className="h-2.5 rounded-pill bg-cream overflow-hidden">
            <div
              className="h-full rounded-pill bg-sage transition-all duration-500"
              style={{ width: `${groupConsensus}%` }}
            />
          </div>
        </div>
      )}

      {winner && (
        <Card tone="sage" lifted className="mb-4 animate-rise">
          <p className="text-xs uppercase tracking-wide text-sage-deep font-extrabold">
            The plan
          </p>
          <p className="font-extrabold text-3xl tracking-tight mt-1">{winner.label}</p>
          {winner.detail && (
            <p className="text-sm text-ink-soft mt-1">{winner.detail}</p>
          )}
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-deep mb-3">{error}</p>
      )}

      <ul className="space-y-2.5">
        {ranked.map((option) => {
          const result = resultFor(option.id);
          const mine = myVotes[option.id] ?? 0;
          const consensus = consensusOf(result);
          const isWinner = poll.winning_option_id === option.id;
          return (
            <li key={option.id}>
              <Card className={isWinner ? 'border-sage border-2' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{option.label}</p>
                    {option.detail && (
                      <p className="text-xs text-ink-faint mt-0.5">{option.detail}</p>
                    )}
                    {option.source === 'ai' && (
                      <span className="text-[10px] uppercase tracking-wide text-terracotta-deep">
                        ✨ suggested by Switchboard
                      </span>
                    )}
                  </div>
                  {(result?.voters ?? 0) > 0 && (
                    <span
                      className="text-xs text-ink-faint whitespace-nowrap"
                      title={`${result?.voters} voted`}
                    >
                      {consensus}% · {result?.voters}
                      <span aria-hidden> 🗳</span>
                    </span>
                  )}
                </div>

                {votingOpen && (
                  <div className="flex gap-2 mt-3" role="group" aria-label={`Rate ${option.label}`}>
                    {WEIGHT_BUTTONS.map((button) => (
                      <button
                        key={button.weight}
                        type="button"
                        disabled={pending}
                        aria-pressed={mine === button.weight}
                        aria-label={button.label}
                        title={button.label}
                        onClick={() => vote(option.id, button.weight)}
                        className={`flex-1 rounded-pill border py-2 text-lg leading-none transition-all active:scale-95 ${
                          mine === button.weight
                            ? button.weight === -1
                              ? 'bg-rose-soft border-rose-deep'
                              : 'bg-sage-soft border-sage'
                            : 'bg-paper border-line hover:border-ink-faint opacity-70'
                        }`}
                      >
                        {button.emoji}
                      </button>
                    ))}
                  </div>
                )}

                {isHost && poll.phase === 'decided' && !poll.winning_option_id && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await pickWinner(poll.id, eventId, option.id);
                        router.refresh();
                      })
                    }
                  >
                    Choose this
                  </Button>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {votingOpen && (poll.allow_suggestions || isHost) && poll.phase !== 'runoff' && (
        <form onSubmit={submitSuggestion} className="flex gap-2 mt-4">
          <input
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            placeholder="Suggest an idea…"
            aria-label="Suggest an idea"
            className="flex-1 rounded-pill border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-terracotta"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending || !suggestion.trim()}>
            Add
          </Button>
        </form>
      )}

      {isHost && votingOpen && (
        <div className="mt-5 flex gap-2">
          {poll.phase === 'suggesting' && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await openVoting(poll.id, eventId);
                  router.refresh();
                })
              }
            >
              Lock suggestions
            </Button>
          )}
          <Button
            size="sm"
            disabled={pending || options.length === 0}
            onClick={() =>
              startTransition(async () => {
                await closeVoting(poll.id, eventId);
                router.refresh();
              })
            }
          >
            {poll.resolution === 'auto'
              ? 'Close voting & pick winner'
              : poll.resolution === 'runoff' && poll.phase !== 'runoff'
                ? 'Close voting → runoff'
                : 'Close voting'}
          </Button>
        </div>
      )}
    </section>
  );
}
