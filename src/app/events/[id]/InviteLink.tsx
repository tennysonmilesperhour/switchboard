'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareButton } from '@/components/ui/ShareButton';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { rotateEventShareLink, setEventShareLink } from '@/lib/actions/events';
import { hostCanShare, hostShareGuidance, type ShareLinkState } from '@/lib/share-link';

interface InviteLinkProps {
  eventId: string;
  /** Absolute URL of the plan's public share link (computed server-side). */
  shareUrl: string;
  /** What the link does right now, from `@/lib/share-link`. */
  state: ShareLinkState;
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
 *
 * The card takes the link's *state*, not a boolean, so what it tells the host
 * and what a recipient actually sees come from the same classifier. A host
 * whose plan is still in a date poll gets a working link plus a plain note that
 * answers open up once the date is set — instead of the old silence, which
 * ended with recipients reporting a dead link the host had no way to see.
 */
export function InviteLink({ eventId, shareUrl, state, eventTitle }: InviteLinkProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await setEventShareLink(eventId, next);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update the invite link.', result.code);
        return;
      }
      toast.success(next ? 'Invite link is live.' : 'Invite link turned off.');
      router.refresh();
    });
  }

  function rotate() {
    startTransition(async () => {
      // One tap used to kill the link everyone already has, with no way back:
      // anyone who hadn't opened it yet would find it dead. Worth one question.
      const ok = await confirm({
        title: 'Replace this invite link?',
        body: 'The link you’ve already sent will stop working. Anyone who hasn’t opened it yet will need the new one.',
        confirmLabel: 'Get a new link',
        danger: true,
      });
      if (!ok) return;
      const result = await rotateEventShareLink(eventId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not refresh the invite link.', result.code);
        return;
      }
      toast.success('New link ready. The old one no longer works.');
      router.refresh();
    });
  }

  const shareable = hostCanShare(state);
  const guidance = hostShareGuidance(state);

  return (
    <section>
      <SectionHeader
        title="Invite link"
        hint="One link that works for anyone you send it to"
      />
      {shareable ? (
        <Card tone="cream" className="space-y-3">
          <p className="text-sm text-ink-soft leading-relaxed">
            Send this to anyone - text, email, a group chat. Anyone who opens it
            sees the plan right away; to say yes or no they sign in, and then
            you’ll see them on the list by name.
          </p>
          {guidance && (
            <p className="rounded-card bg-paper px-3.5 py-3 text-sm leading-relaxed text-ink">
              {guidance}
            </p>
          )}
          <div className="flex items-center gap-2 rounded-card border border-line bg-paper px-3 py-2.5">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate rounded text-sm font-semibold text-terracotta-deep underline decoration-terracotta/40 underline-offset-2 hover:text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
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
          <p className="text-sm text-ink-soft leading-relaxed">{guidance}</p>
          {/* Only `off` is something the host can undo from here. A draft needs
              publishing, which lives in the wizard. */}
          {state === 'off' && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => toggle(true)}
            >
              {pending ? 'Turning on…' : 'Turn on invite link 🔗'}
            </Button>
          )}
        </Card>
      )}
    </section>
  );
}
