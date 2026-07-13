'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareButton } from '@/components/ui/ShareButton';
import { useToast } from '@/components/ui/Toast';
import { setEventInviteLink } from '@/lib/actions/events';

interface InviteLinkProps {
  eventId: string;
  /** Absolute URL of the public join page (computed server-side). */
  shareUrl: string;
  /** App-relative path for the native share sheet. */
  sharePath: string;
  /** Whether the link is currently live (event.open_table). */
  enabled: boolean;
  eventTitle: string;
}

/**
 * Host/co-host control for the post-creation invite link. Turn it on and you
 * get one link to copy and send however you like; anyone who opens it can ask to
 * join, and you approve each request. Turn it off and the link stops taking new
 * requests.
 */
export function InviteLink({
  eventId,
  shareUrl,
  sharePath,
  enabled,
  eventTitle,
}: InviteLinkProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await setEventInviteLink(eventId, next);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update the invite link.');
        return;
      }
      toast.success(next ? 'Invite link is live.' : 'Invite link turned off.');
      router.refresh();
    });
  }

  return (
    <section>
      <SectionHeader
        title="Invite link"
        hint="Share one link to invite more people after the plan is made"
      />
      {enabled ? (
        <Card tone="cream" className="space-y-3">
          <p className="text-sm text-ink-soft leading-relaxed">
            Send this to anyone — text, email, a group chat. They open it, ask to
            join, and you get the final say on who’s in.
          </p>
          <div className="flex items-center gap-2 rounded-card border border-line bg-paper px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-soft" title={shareUrl}>
              {shareUrl}
            </span>
            <CopyButton text={shareUrl} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ShareButton
              path={sharePath}
              title={eventTitle}
              text={`You’re invited: ${eventTitle}`}
              label="Share"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => toggle(false)}
            >
              Turn off link
            </Button>
          </div>
        </Card>
      ) : (
        <Card tone="cream" className="space-y-3">
          <p className="text-sm text-ink-soft leading-relaxed">
            Want to invite more people without adding each one by hand? Turn on a
            shareable link. Anyone who opens it can ask to join, and every request
            still comes to you to approve.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => toggle(true)}
          >
            {pending ? 'Creating…' : 'Create invite link 🔗'}
          </Button>
        </Card>
      )}
    </section>
  );
}
