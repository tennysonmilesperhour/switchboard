/**
 * Browser-side web-push helpers, shared by the settings PushManager and the
 * app-wide "turn on notifications" nudge so they never drift apart.
 */

import type { ErrorCode } from '@/lib/errors';

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed';

/** The browser subscribed but the server would not record it for this account. */
export class PushSaveError extends Error {
  readonly code?: ErrorCode;

  constructor(message: string, code?: ErrorCode) {
    super(message);
    this.name = 'PushSaveError';
    this.code = code;
  }
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: ErrorCode;
  };
  throw new PushSaveError(
    body.error ?? 'Switchboard couldn’t turn on push for this device.',
    body.code ?? 'SB-PUSH-SAVE',
  );
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/** Current push state for this browser: unsupported / permission / subscribed. */
export async function getPushState(): Promise<PushState> {
  // Yield first so callers can invoke this straight from an effect without a
  // synchronous setState (matches the react-hooks/set-state-in-effect rule).
  await Promise.resolve();
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? 'subscribed' : (Notification.permission as PushState);
}

/**
 * The switch's answer for this browser AND this account. A subscription the
 * browser holds may still be registered to whoever was signed in here before,
 * so register it again for the current session; if that fails, report it as
 * off rather than claiming pushes this account will never receive.
 */
export async function getSyncedPushState(): Promise<PushState> {
  const state = await getPushState();
  if (state !== 'subscribed') return state;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return Notification.permission as PushState;
  try {
    await saveSubscription(subscription);
    return 'subscribed';
  } catch {
    return Notification.permission as PushState;
  }
}

/**
 * Prompt for permission, subscribe, and persist the subscription server-side.
 * Returns the resulting state ('subscribed' on success, otherwise the permission
 * or 'unsupported' when VAPID isn't configured). Throws `PushSaveError` when
 * the server refuses the subscription, after dropping it from the browser so
 * the switch can't show on for pushes that will never arrive.
 */
export async function enablePush(): Promise<PushState> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return 'unsupported';

  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushState;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
  try {
    await saveSubscription(subscription);
  } catch (error) {
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  return 'subscribed';
}

/**
 * Turn push off on this device: unsubscribe locally and drop the row
 * server-side so we stop trying to reach a subscription the user retired.
 * Returns the resulting state — 'default' when it cleanly unsubscribed (the
 * browser permission itself can only be revoked from browser settings, so a
 * previously-granted permission reports back as 'default' here, i.e. re-enable
 * is a single tap). Best-effort and never throws.
 */
export async function disablePush(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => {});
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  }
  return 'default';
}

/**
 * Detach this browser from the account that is signing out. Without it the
 * subscription row keeps naming them, so their notifications, titles and all,
 * go on landing on a device somebody else may sign into next. Runs before the
 * session ends because the DELETE needs it, and is bounded so a stalled
 * service worker can never hold sign-out hostage.
 */
export async function releasePushOnSignOut(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const release = (async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const { endpoint } = subscription;
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  })().catch(() => {});
  await Promise.race([release, new Promise((resolve) => setTimeout(resolve, 2500))]);
}
