'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareButton } from '@/components/ui/ShareButton';
import { useToast } from '@/components/ui/Toast';
import { rotateEventShareLink, setEventShareLink } from '@/lib/actions/events';

interface InviteLinkProps {
  eventId: string;
  /** Absolute URL of the plan's public share link (computed server-side). */
  shareUrl: string;
  /** Whether the link is currently live (event.share_link_active). */
  enabled: boolean;
  eventTitle: string;
}

/**
 * Host/co-host control for the plan's public invite link.
 *
 * The link is live by default and opens the plan for anyone the host sends it to
 * — signed out, no account, any device; answering is the step that asks for a
 * sign-in. The controls here are the safety valves:
 * turn it off if it travelled further than intended, or rotate it to invalidate
 * what was already shared while keeping the plan open.
 */
export function InviteLink({ eventId, shareUrl, enabled, eventTitle }: InviteLinkProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await setEventShareLink(eventId, next);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update the invite link.');
        return;
      }
      toast.success(next ? 'Invite link is live.' : 'Invite link turned off.');
      router.refresh();
    });
  }

  function rotate() {
    startTransition(async () => {
      const result = await rotateEventShareLink(eventId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not refresh the invite link.');
        return;
      }
      toast.success('New link ready. The old one no longer works.');
      router.refresh();
    });
  }

  return (
    <section>
      <SectionHeader
        title="Invite link"
        hint="One link that works for anyone you send it to"
      />
      {enabled ? (
        <Card tone="cream" className="space-y-3">
          <p className="text-sm text-ink-soft leading-relaxed">
            Send this to anyone - text, email, a group chat. Anyone who opens it
            sees the plan right away; to say yes or no they sign in, and then
            you’ll see them on the list by name.
          </p>
          <div className="flex items-center gap-2 rounded-card border border-line bg-paper px-3 py-2.5">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate rounded text-sm font-semibold text-terracotta-deep underline decoration-terracotta/40 underline-offset-2 hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              title={shareUrl}
            >
              {shareUrl}
            </a>
            <CopyButton text={shareUrl} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ShareButton
              url={shareUrl}
              title={eventTitle}
              text={`You’re invited: ${eventTitle}`}
              label="Share"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={rotate}
            >
              Get a new link
            </Button>
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
            The invite link for this plan is off, so anyone who already has it
            sees “this link isn’t active”. Turn it back on to share the plan
            again.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => toggle(true)}
          >
            {pending ? 'Turning on…' : 'Turn on invite link 🔗'}
          </Button>
        </Card>
      )}
    </section>
  );
}
