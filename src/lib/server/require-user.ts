import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { failure, type Failure } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

function safeRedirectPath(to: string): string {
  // Next's redirect accepts absolute URLs. Authentication callers only need
  // same-origin paths, so reject protocol-relative URLs, backslashes, and
  // other values that browsers may interpret as an external destination.
  if (!to.startsWith('/') || to.startsWith('//') || to.includes('\\')) {
    return '/login';
  }
  return to;
}

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
  } = await supabase.auth.getUser();
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
  if (!user) redirect(safeRedirectPath(to));
  return { supabase, user };
}
