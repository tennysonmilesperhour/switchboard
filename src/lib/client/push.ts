/**
 * Browser-side web-push helpers, shared by the settings PushManager and the
 * app-wide "turn on notifications" nudge so they never drift apart.
 */

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed';

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
 * Prompt for permission, subscribe, and persist the subscription server-side.
 * Returns the resulting state ('subscribed' on success, otherwise the permission
 * or 'unsupported' when VAPID isn't configured).
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
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  return response.ok ? 'subscribed' : (Notification.permission as PushState);
}
