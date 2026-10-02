import type { RealtimeChannel } from '@supabase/supabase-js';

type SubscribeCallback = Parameters<RealtimeChannel['subscribe']>[0];

/** The two parts of a Supabase client this needs, whatever its schema type. */
interface RealtimeHost {
  realtime: { setAuth(token?: string | null): Promise<void> };
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
}

/**
 * Subscribe a realtime channel only once the socket holds the reader's token,
 * and return the one cleanup that undoes either half.
 *
 * Without this, the first channel a page opens joins as the anonymous role:
 * realtime-js fetches the session token in the background on connect, the
 * join goes out before it resolves, and the token is only pushed to channels
 * that have *finished* joining. Every table here is owner-only under RLS, so a
 * channel joined anonymously never receives a row. That is how live
 * notifications (the bell, the banner, Moments' refresh) never arrived, while
 * a channel opened later on the same page worked. Found in a browser on
 * 2026-10-02; nothing threw.
 */
export function subscribeAuthorized(
  supabase: RealtimeHost,
  channel: RealtimeChannel,
  callback?: SubscribeCallback,
): () => void {
  let active = true;
  // With no argument, setAuth reads the session through the client's own
  // token callback, so the anon key still stands in for a signed-out visitor.
  void supabase.realtime
    .setAuth()
    .catch(() => undefined)
    .then(() => {
      if (active) channel.subscribe(callback);
    });
  return () => {
    active = false;
    void supabase.removeChannel(channel);
  };
}
