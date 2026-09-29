'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import {
  enablePush,
  disablePush,
  getSyncedPushState,
  PushSaveError,
  type PushState,
} from '@/lib/client/push';

/**
 * The device-level push control: a real on/off switch for "send pushes to this
 * browser". Turning it on prompts for permission and registers the
 * subscription; turning it off unsubscribes this device. This is the master
 * gate — with it off, the per-category preferences below have nothing to act
 * on. Permission that's been hard-blocked in the browser can't be re-prompted,
 * so we say so instead of showing a dead toggle.
 */
export function PushManager({ serverConfigured = true }: { serverConfigured?: boolean }) {
  const [state, setState] = useState<PushState>('default');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    getSyncedPushState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      setState(next ? await enablePush() : await disablePush());
    } catch (error) {
      setState(Notification.permission as PushState);
      if (error instanceof PushSaveError) {
        toast.error(error.message, error.code);
      } else {
        toast.error('Switchboard couldn’t turn on push for this device.', 'SB-PUSH-SAVE');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!serverConfigured) {
    return <p role="alert" className="text-sm text-rose-deep">Push is not configured on this server yet. An administrator needs to add the VAPID keys.</p>;
  }

  if (state === 'unsupported') {
    return (
      <p className="text-sm text-ink-faint">
        Push notifications aren’t available here. On iPhone, add Switchboard to
        your home screen first.
      </p>
    );
  }

  const subscribed = state === 'subscribed';
  const blocked = state === 'denied';

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">Push on this device</p>
        <p className="mt-0.5 text-sm text-ink-soft leading-relaxed">
          {blocked
            ? 'Notifications are blocked in your browser settings — turn them back on there to enable push.'
            : subscribed
              ? 'This browser will receive the categories you’ve turned on below.'
              : busy
                ? 'Setting up…'
                : 'Get matches, invitations, and confirmed plans on this device.'}
        </p>
      </div>
      <Switch
        checked={subscribed}
        disabled={busy || blocked}
        onCheckedChange={toggle}
        label="Push notifications on this device"
      />
    </div>
  );
}
