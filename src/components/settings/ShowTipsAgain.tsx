'use client';

import { useState } from 'react';
import {
  GETTING_STARTED_DISMISS_KEY,
  GETTING_STARTED_RESHOW_KEY,
} from '@/components/home/GettingStarted';
import {
  clearDeviceFlag,
  readDeviceFlag,
  writeDeviceFlag,
} from '@/components/system/device-storage';

/**
 * Clears the device-level dismissal and asks for the Home checklist back, even
 * when every step is already done (which would otherwise retire it).
 *
 * Storage can be unavailable (private windows, blocked site data). The write
 * is read back rather than assumed, so the button never promises "it'll be on
 * Home" when this device cannot remember that it should be.
 */
export function ShowTipsAgain() {
  const [state, setState] = useState<'idle' | 'restored' | 'unavailable'>('idle');

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={state === 'restored'}
        onClick={() => {
          clearDeviceFlag(GETTING_STARTED_DISMISS_KEY);
          writeDeviceFlag(GETTING_STARTED_RESHOW_KEY, '1');
          setState(readDeviceFlag(GETTING_STARTED_RESHOW_KEY) === '1' ? 'restored' : 'unavailable');
        }}
        className="rounded-pill border border-line px-3.5 py-2 text-sm font-bold text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors disabled:opacity-70"
      >
        {state === 'restored'
          ? 'It’ll be on Home next visit'
          : 'Show the getting-started checklist again'}
      </button>
      {state === 'unavailable' && (
        <p role="status" className="text-xs text-ink-soft">
          This browser isn’t letting Switchboard remember that — usually a private window or
          blocked site data. Allow site data for Switchboard, then try again.
        </p>
      )}
    </div>
  );
}
