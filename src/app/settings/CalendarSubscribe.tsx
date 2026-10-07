'use client';

import { useTransition } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { regenerateCalendarToken } from '@/lib/actions/profile';
import { failure } from '@/lib/errors';
import { calendarFeedUrl, webcalSubscribeUrl } from '@/lib/links';

/** Subscribe-to-your-plans control: a personal, revocable calendar feed URL.
 *
 *  Both URLs come from `src/lib/links.ts`, rooted at the configured public
 *  origin — never the page's host, which may be an ephemeral, access-protected
 *  preview that calendar apps can't subscribe to. When that origin isn't
 *  configured the builder throws, and the reader sees the coded failure instead
 *  of a link that would silently stop working. */
export function CalendarSubscribe({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();

  /** Build a feed URL, or show SB-CONFIG-ORIGIN and return null. */
  function buildUrl(build: (calendarToken: string) => string): string | null {
    try {
      return build(token);
    } catch {
      const missing = failure('SB-CONFIG-ORIGIN');
      toast.error(missing.error, missing.code);
      return null;
    }
  }

  function subscribe() {
    // webcal:// prompts most calendar apps to subscribe directly.
    const url = buildUrl(webcalSubscribeUrl);
    if (url) window.location.href = url;
  }

  async function copyLink() {
    const url = buildUrl(calendarFeedUrl);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Calendar link copied.');
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  async function revoke() {
    const ok = await confirm({
      title: 'Reset your calendar link?',
      body: 'Any calendar following the old link will stop updating. You’ll get a fresh link to share again.',
      confirmLabel: 'Reset link',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await regenerateCalendarToken();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not reset the link. Try again.', result.code);
        return;
      }
      toast.success('Calendar link reset.');
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-soft leading-relaxed">
        Your plans, in the calendar you already use. Subscribe once and confirmed
        plans show up automatically. The link is private to you.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={subscribe}
          className="inline-flex items-center gap-1.5 rounded-btn bg-brand-gradient px-4 py-2.5 text-sm font-bold text-white shadow-lift active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          Subscribe
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          <Icon name="link" size={14} />
          Copy link
        </button>
      </div>
      <p className="text-xs text-ink-faint leading-relaxed">
        If “Subscribe” doesn’t open your calendar, tap <strong>Copy link</strong>{' '}
        and add it as a new calendar subscription — Google Calendar → Other
        calendars → From URL, or Apple Calendar → File → New Calendar
        Subscription. It’s a private, read-only https link.
      </p>
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        className="rounded-pill px-1 py-1 text-xs text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
      >
        Reset link
      </button>
    </div>
  );
}
