import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { failure, type Failure } from '@/lib/errors';
import { safeNextPath } from '@/lib/security';
import { isSuspendedAuthError, isSuspendedUser } from '@/lib/suspension';
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
  | Failure
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  // A session issued before a moderator suspended the account is still a
  // session. The proxy sends its next page load to /login to say so; an
  // action sent from a tab that was already open is refused here, with the
  // same code, rather than being carried out (docs/AUTH.md). The auth server
  // reports it as `user_banned` with no user, so check that before "no user".
  if (isSuspendedAuthError(error) || (user && isSuspendedUser(user))) {
    return failure('SB-AUTH-SUSPENDED', 'This account is suspended, so nothing can be changed from it.');
  }
  if (!user) return failure('SB-AUTH-REQUIRED');
  return { ok: true, supabase, user };
}

/** Read the current user when an action genuinely supports anonymous use. */
export async function getOptionalUser(): Promise<{
  supabase: ServerClient;
  user: User | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function requireUserOrRedirect(
  to = '/login',
): Promise<{ supabase: ServerClient; user: User }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(safeNextPath(to, '/login'));
  return { supabase, user };
}
