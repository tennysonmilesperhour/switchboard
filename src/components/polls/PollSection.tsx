'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
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
import { nextWeight, type Weight } from '@/lib/engine/scoring';
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

/**
 * How long to sit on a tally bump before re-fetching aggregates.
 *
 * The bump trigger fires for every vote on the poll, including the ones this
 * device just cast, and a group ranking a list together produces them in
 * bursts. Coalescing turns a burst into one re-render.
 */
const TALLY_REFRESH_MS = 600;

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

  // What the rating buttons show.
  //
  // `myVotes` is server state: it only changes when an RSC render delivers new
  // props. Reading the buttons straight off it meant a tap showed nothing at
  // all until the round trip landed, so a press read as ignored — and pressing
  // again made it worse, because the toggle below recomputed from the same
  // stale prop. The optimistic overlay holds the tapped weight until the
  // action's own re-render replaces it, and drops automatically if the write
  // fails.
  const [shownVotes, showVote] = useOptimistic(
    myVotes,
    (current, cast: { optionId: string; weight: Weight }) => ({
      ...current,
      [cast.optionId]: cast.weight,
    }),
  );

  // Live consensus: a DB trigger bumps polls.tally_version on every vote change.
  // Subscribe to this poll's row and re-fetch aggregates so the meter moves as
  // others vote, without ever exposing an individual vote.
  //
  // Coalesced, because that trigger is noisier than it looks: it fires for this
  // device's own votes too, each of which already brought a freshly rendered
  // page back with the action's response. Refreshing on every bump meant a
  // second full re-render per vote and a pile-up of them whenever a group
  // ranked a list at the same time — the page busy re-rendering is what made
  // the buttons feel unresponsive.
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
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
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), TALLY_REFRESH_MS);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
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

  // Every action below revalidates this path, and Next.js ships the re-rendered
  // page in the same response as the action's return value. A router.refresh()
  // afterwards is therefore a second round trip fetching data we were already
  // handed — it used to sit between a tap and the button changing colour. Only
  // the realtime subscription above refreshes, because someone else's vote is
  // the one case where nothing has been handed to us.

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
    // From the optimistic view, never `myVotes` — see nextWeight's note on why
    // the starting point has to be the weight the voter can actually see.
    const next = nextWeight(shownVotes[optionId] ?? 0, weight);
    setError('');
    startTransition(async () => {
      showVote({ optionId, weight: next });
      const result = await castVote(poll.id, eventId, optionId, next);
      if (!result.ok) setError(result.error ?? 'Vote failed');
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
          const mine = shownVotes[option.id] ?? 0;
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
                        // Deliberately never disabled. `pending` is one flag for
                        // the whole section, so disabling on it took every
                        // rating button on every option out of service while any
                        // single vote was in flight — the taps people described
                        // as doing nothing were landing on dead buttons. Nothing
                        // is lost by leaving them live: Next.js dispatches server
                        // actions one at a time per client, so a flurry of taps
                        // queues in order and the last one wins, while the
                        // optimistic overlay keeps the screen honest throughout.
                        key={button.weight}
                        type="button"
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
