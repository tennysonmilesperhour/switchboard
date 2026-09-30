import { Card } from '@/components/ui/Card';
import { RsvpCard } from '@/components/events/RsvpCard';
import type { RsvpQuestion } from '@/components/events/RsvpQuestions';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import { inviteeCanChangeAnswer } from '@/lib/share-link';
import type { EventQuestion, Invite } from '@/lib/types';

/**
 * Where the viewer's own invitation stands, on the plan page.
 *
 * One card per state, so that every state an invitee can be in says something:
 * an Open Table request used to render nothing at all, so someone who asked to
 * join and tapped "See the plan" found no trace of having asked (G20), and a
 * no could never be taken back (D17). A yes held for a guardian is the
 * guardian step's to explain, and renders nothing here.
 */
export function MyInviteCard({
  invite,
  eventStatus,
  questions,
  rsvpAnchorId,
  guardianDenied,
}: {
  invite: Invite;
  eventStatus: string;
  questions: EventQuestion[];
  /** The anchor the thread's "RSVP to unlock" points at; set only for `sent`. */
  rsvpAnchorId: string | null;
  /** A guardian's no is not the invitee's to take back (the guardian step shows it). */
  guardianDenied: boolean;
}) {
  const asked: RsvpQuestion[] = questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    required: q.required,
    kind: q.kind === 'choice' ? 'choice' : 'text',
    options: q.options,
  }));
  if (invite.status === 'sent' && rsvpAnchorId) {
    return (
      <div id={rsvpAnchorId} className="scroll-mt-20">
        <RsvpCard
          inviteId={invite.id}
          questions={asked}
          expiresAtIso={
            inviteExpiresAt({
              id: invite.id,
              position: invite.position,
              groupStage: invite.group_stage,
              status: invite.status,
              windowMinutes: invite.window_minutes,
              sentAt: invite.sent_at,
            })?.toISOString() ?? null
          }
        />
      </div>
    );
  }
  if (invite.status === 'declined' && !guardianDenied && inviteeCanChangeAnswer(eventStatus)) {
    return (
      <RsvpCard inviteId={invite.id} questions={asked} expiresAtIso={null} reconsider />
    );
  }
  if (invite.status === 'accepted') {
    return (
      <Card tone="sage" lifted>
        <p className="font-extrabold text-lg text-sage-deep">You’re in ✓</p>
        <p className="text-sm text-ink-soft mt-0.5">See you there. The room has the details.</p>
      </Card>
    );
  }
  if (invite.status === 'waitlisted') {
    return (
      <Card tone="gold" lifted>
        <p className="font-extrabold text-lg">You’re on the waitlist</p>
        <p className="text-sm text-ink-soft mt-0.5">
          If a spot opens up, you’ll be the first to know.
        </p>
      </Card>
    );
  }
  if (invite.status === 'requested') {
    return (
      <Card tone="gold" lifted>
        <p className="font-extrabold text-lg">You asked to join</p>
        <p className="text-sm text-ink-soft mt-0.5">
          The host approves every request, and you’ll hear back either way.
          Until then you can see the plan, but you’re not on the list yet.
        </p>
      </Card>
    );
  }
  return null;
}
