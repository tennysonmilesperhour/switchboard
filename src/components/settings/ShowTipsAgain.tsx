'use client';

import { useState } from 'react';
import {
  GETTING_STARTED_DISMISS_KEY,
  GETTING_STARTED_RESHOW_KEY,
} from '@/components/home/GettingStarted';

/**
 * Clears the device-level dismissal and asks for the Home checklist back, even
 * when every step is already done (which would otherwise retire it).
 */
export function ShowTipsAgain() {
  const [restored, setRestored] = useState(false);

  return (
    <button
      type="button"
      disabled={restored}
      onClick={() => {
        localStorage.removeItem(GETTING_STARTED_DISMISS_KEY);
        localStorage.setItem(GETTING_STARTED_RESHOW_KEY, '1');
        setRestored(true);
      }}
      className="rounded-pill border border-line px-3.5 py-2 text-sm font-bold text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors disabled:opacity-70"
    >
      {restored ? '✓ It’ll be on Home next visit' : 'Show the getting-started checklist again'}
    </button>
  );
}
