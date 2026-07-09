'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { enablePush, getPushState, type PushState } from '@/lib/client/push';

export function PushManager() {
  const [state, setState] = useState<PushState>('default');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      setState(await enablePush());
    } finally {
      setBusy(false);
    }
  }

  if (state === 'unsupported') {
    return (
      <p className="text-sm text-ink-faint">
        Push notifications aren’t available here. On iPhone, add Switchboard to
        your home screen first.
      </p>
    );
  }
  if (state === 'subscribed') {
    return (
      <p className="text-sm text-sage-deep">
        ✓ Notifications are on - matches, invitations, and confirmed plans.
      </p>
    );
  }
  if (state === 'denied') {
    return (
      <p className="text-sm text-ink-faint">
        Notifications are blocked in your browser settings.
      </p>
    );
  }
  return (
    <Button variant="secondary" size="sm" disabled={busy} onClick={enable}>
      {busy ? 'Enabling…' : 'Enable notifications 🔔'}
    </Button>
  );
}
