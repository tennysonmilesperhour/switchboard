'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { addFollowUpPoll } from '@/lib/actions/polls';
import { POLL_TOPICS, SUGGESTED_FOLLOW_UPS, type PollTopic } from '@/lib/types';

interface FollowUpComposerProps {
  parentPollId: string;
  eventId: string;
  parentTopic: PollTopic;
  hasPending: boolean;
}

/**
 * "What should we decide after this?" — the host's way to queue the next
 * question without having to remember to ask it.
 *
 * The suggested topics come from what usually follows the current one (a date
 * unlocks where and what; a place unlocks food), so the common chain is two
 * taps. Anything else is a custom question in the host's own words.
 *
 * Collapsed by default. A host mid-decision is not looking for more form.
 */
export function FollowUpComposer({
  parentPollId,
  eventId,
  parentTopic,
  hasPending,
}: FollowUpComposerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const suggested = SUGGESTED_FOLLOW_UPS[parentTopic] ?? ['custom'];
  const topics = POLL_TOPICS.filter((entry) => suggested.includes(entry.topic));

  function add(topic: PollTopic, title?: string) {
    startTransition(async () => {
      const result = await addFollowUpPoll(parentPollId, eventId, topic, title);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not add that question.', result.code);
        return;
      }
      setCustom('');
      setOpen(false);
      toast.success('Queued. It opens when this one is settled.');
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
      >
        {hasPending ? 'Queue another question' : 'Decide something after this →'}
      </button>
    );
  }

  return (
    <Card className="space-y-3" aria-busy={pending}>
      <div>
        <p className="text-sm font-bold text-ink">What comes next?</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
          It stays closed until this question is settled, then opens by itself
          and everyone gets one nudge.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {topics.map((entry) => (
          <button
            key={entry.topic}
            type="button"
            disabled={pending}
            onClick={() => add(entry.topic)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium hover:border-terracotta hover:text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-40"
          >
            {entry.emoji} {entry.question}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && custom.trim()) {
              event.preventDefault();
              add('custom', custom);
            }
          }}
          maxLength={120}
          aria-label="Ask something else"
          placeholder="Or ask something else…"
          className="min-w-0 flex-1 rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
        />
        <Button
          type="button"
          size="sm"
          disabled={pending || !custom.trim()}
          onClick={() => add('custom', custom)}
        >
          Queue
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="min-h-11 text-xs font-medium text-ink-faint hover:text-ink"
      >
        Never mind
      </button>
    </Card>
  );
}
