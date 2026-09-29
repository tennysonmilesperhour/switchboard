'use client';

import { useOptimistic, useTransition } from 'react';
import { Card, SectionHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { setEventVisibility } from '@/lib/actions/events';

type Field = 'show_invite_list' | 'show_accepted';

interface PrivacyAccessProps {
  eventId: string;
  showInviteList: boolean;
  showAccepted: boolean;
}

const OPTIONS: Array<{ field: Field; label: string; hint: string }> = [
  {
    field: 'show_accepted',
    label: 'Show who’s in',
    hint: 'Guests can see who has already accepted.',
  },
  {
    field: 'show_invite_list',
    label: 'Show the whole invite list',
    hint: 'Guests can see everyone you’ve asked so far - never people still waiting in line, or anyone who said no.',
  },
];

/**
 * Who can see what on this plan, in one place, after it exists.
 *
 * These flags were settable exactly once — on the wizard's Visibility step —
 * and then frozen for the life of the plan. A host who wanted to open the
 * guest list up once people were in, or close it after over-sharing, had
 * nowhere to go. Everything else about access (the invite link, join requests,
 * co-hosts) already had a post-creation home on this page; this was the gap.
 *
 * Each toggle applies immediately and optimistically. The server re-checks
 * host/co-host on every call, and both lists re-read their flag server-side —
 * `show_accepted` in the attendee query, `show_invite_list` inside the
 * `event_invite_list` function — so nothing here is trusted from the client.
 *
 * "Keep expired invitations readable" used to be a third toggle here. Nothing
 * ever read it, so it promised something the plan did not do; decision D3
 * retired it rather than build it.
 */
export function PrivacyAccess({
  eventId,
  showInviteList,
  showAccepted,
}: PrivacyAccessProps) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const server: Record<Field, boolean> = {
    show_invite_list: showInviteList,
    show_accepted: showAccepted,
  };

  const [view, apply] = useOptimistic(
    server,
    (state, action: { field: Field; on: boolean }) => ({
      ...state,
      [action.field]: action.on,
    }),
  );

  function toggle(field: Field, on: boolean) {
    startTransition(async () => {
      apply({ field, on });
      const result = await setEventVisibility(eventId, field, on);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change that.', result.code);
      }
    });
  }

  return (
    <section aria-busy={pending}>
      <SectionHeader
        title="Privacy and access"
        hint="What your guests can see about each other"
      />
      <Card className="space-y-3">
        {OPTIONS.map((option) => (
          <label
            key={option.field}
            className="flex cursor-pointer items-start gap-3"
          >
            <input
              type="checkbox"
              checked={view[option.field]}
              disabled={pending}
              onChange={(event) => toggle(option.field, event.target.checked)}
              className="mt-0.5 size-4 accent-terracotta"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">{option.label}</span>
              <span className="block text-xs leading-snug text-ink-faint">
                {option.hint}
              </span>
            </span>
          </label>
        ))}
        <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
          Who can answer and who can share this plan are set by the invite link
          card above. Answers to your RSVP questions are always yours alone.
        </p>
      </Card>
    </section>
  );
}
