'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { enablePush, getPushState, type PushState } from '@/lib/client/push';
import { useBottomOverlaySlot } from '@/components/system/BottomOverlaySlot';

const DISMISS_KEY = 'sb-push-nudge-dismissed';

/**
 * App-wide, dismissible prompt to turn on notifications. Shows only when the
 * browser supports push and permission hasn't been decided yet — so people who
 * skipped the settings toggle still get a clear, one-tap way to enable pushes
 * (and a reminder that on iPhone the app must be added to the home screen).
 * Self-hides once subscribed, denied, unsupported, or dismissed.
 */
export function NotificationNudge() {
  // Start hidden; the effect reveals it only after checking support + storage,
  // which also avoids any SSR/client hydration mismatch.
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);
  const wantsSlot = !dismissed && state === 'default';
  const ownsSlot = useBottomOverlaySlot('notifications', wantsSlot, 30);

  useEffect(() => {
    let cancelled = false;
    getPushState().then((next) => {
      if (cancelled) return;
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
      setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!wantsSlot || !ownsSlot) return null;

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === 'unsupported') {
        // iPhone-in-a-tab and the like — keep the hint, don't nag further.
        localStorage.setItem(DISMISS_KEY, '1');
      }
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    // Pinned above the tab bar rather than sitting in the document flow. It
    // decides whether to show itself only after an async push-state check, so
    // in flow it inserted a band above <main> a beat after hydration and shoved
    // the whole page down — on every route, every load. Out of flow it can
    // appear whenever it likes and nothing moves. z-30 keeps it under the tab
    // bar (z-40) rather than over it.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+4.75rem)]">
      <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-card border border-line bg-gold-soft px-3.5 py-2.5 shadow-float">
        <Icon name="bell" size={18} className="shrink-0 text-terracotta-deep" />
        <p className="flex-1 text-xs text-ink-soft leading-snug">
          <span className="font-bold text-ink">Turn on notifications</span> so you
          never miss an invite. On iPhone, add Switchboard to your home screen first.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={turnOn}
          className="inline-flex min-h-11 shrink-0 items-center rounded-pill bg-ink px-3 text-xs font-bold text-paper transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Enabling…' : 'Turn on'}
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-paper/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
