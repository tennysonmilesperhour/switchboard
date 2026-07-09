'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { enablePush, getPushState, type PushState } from '@/lib/client/push';

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

  if (dismissed || state !== 'default') return null;

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
    <div className="px-4 pt-2">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-card border border-line bg-gold-soft px-3.5 py-2.5">
        <Icon name="bell" size={18} className="shrink-0 text-terracotta-deep" />
        <p className="flex-1 text-xs text-ink-soft leading-snug">
          <span className="font-bold text-ink">Turn on notifications</span> so you
          never miss an invite. On iPhone, add Switchboard to your home screen first.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={turnOn}
          className="shrink-0 rounded-pill bg-ink px-3 py-1.5 text-xs font-bold text-paper active:scale-[0.98] transition disabled:opacity-60"
        >
          {busy ? 'Enabling…' : 'Turn on'}
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="shrink-0 rounded-full p-1 text-ink-faint hover:text-ink"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
