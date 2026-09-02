'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useBottomOverlaySlot } from '@/components/system/BottomOverlaySlot';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'sb-install-dismissed';

/**
 * A calm, one-time "add to home screen" nudge. Captures the browser's
 * beforeinstallprompt so we can offer install on our terms (a single
 * dismissible pill, never a repeated nag), matching the no-pressure brand.
 * Silent where the browser gives us nothing to work with (already installed,
 * or iOS Safari, which has no beforeinstallprompt).
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const ownsSlot = useBottomOverlaySlot('install', Boolean(deferred), 20);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    // Already running as an installed app — nothing to prompt.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => {
      setDeferred(null);
      localStorage.setItem(DISMISSED_KEY, '1');
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred || !ownsSlot) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDeferred(null);
  }

  async function install() {
    const event = deferred;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // Accepting the prompt is not the same as ending up with an app. The
    // browser still has to build and install a package, and Android can refuse
    // it — a beta tester hit Play Protect's "built for an older version of
    // Android" at exactly this point. Persisting the dismissal on `accepted`
    // meant that device never saw the offer again: the one person we know
    // wanted the app was the one person who could no longer install it.
    //
    // So only a real "no thanks" is remembered here. Success is remembered by
    // the `appinstalled` listener above, which is the only signal that means
    // the app exists. A blocked install simply leaves the offer standing, and
    // Chrome re-fires `beforeinstallprompt` on a later visit.
    if (outcome === 'dismissed') localStorage.setItem(DISMISSED_KEY, '1');
    setDeferred(null);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-pill bg-ink text-paper px-4 py-2.5 shadow-lift animate-rise">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon name="sparkle" size={16} className="text-terracotta-deep" />
          Add Switchboard to your home screen
        </span>
        <button
          type="button"
          onClick={install}
          className="inline-flex min-h-11 items-center rounded-pill bg-paper px-3 text-xs font-semibold text-ink transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          Add
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="inline-flex size-11 items-center justify-center rounded-full text-paper/70 transition hover:text-paper active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
