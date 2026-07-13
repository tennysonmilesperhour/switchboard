import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The auth preamble every server action shares: create the session client, read
 * the authenticated user, and bail if there is none. Two flavors for the two
 * conventions in this codebase:
 *
 *   - `requireUser()` for actions that return `{ ok, error }`:
 *       const auth = await requireUser();
 *       if (!auth.ok) return auth;
 *       const { supabase, user } = auth;
 *
 *   - `requireUserOrRedirect()` for pages / actions that redirect a signed-out
 *     visitor instead of returning an error.
 *
 * Identity always comes from `supabase.auth.getUser()` (validates the JWT with
 * the auth server) — never from client-supplied state. See docs/SECURITY.md.
 */
export async function requireUser(): Promise<
  | { ok: true; supabase: ServerClient; user: User }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  return { ok: true, supabase, user };
}

export async function requireUserOrRedirect(
  to = '/login',
): Promise<{ supabase: ServerClient; user: User }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(to);
  return { supabase, user };
}
