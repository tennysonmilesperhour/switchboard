'use client';

import { useTransition } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { regenerateCalendarToken } from '@/lib/actions/profile';

/** Subscribe-to-your-plans control: a personal, revocable calendar feed URL.
 *  URLs are built at click time so nothing origin-dependent renders on the
 *  server (avoids a hydration mismatch). */
export function CalendarSubscribe({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();

  function subscribe() {
    // webcal:// prompts most calendar apps to subscribe directly.
    window.location.href = `webcal://${window.location.host}/api/calendar/${token}`;
  }

  async function copyLink() {
    const url = `${window.location.origin}/api/calendar/${token}`;
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
        toast.error('Could not reset the link. Try again.');
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
          📅 Subscribe
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
