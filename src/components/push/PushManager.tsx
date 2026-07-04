'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PushManager() {
  const [state, setState] = useState<PushState>('default');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Yield first - never set state synchronously inside the effect body.
      await Promise.resolve();
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (!cancelled) setState('unsupported');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      if (cancelled) return;
      setState(
        subscription ? 'subscribed' : (Notification.permission as PushState),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setState('unsupported');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission as PushState);
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (response.ok) setState('subscribed');
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
