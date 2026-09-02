import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Database } from '@/lib/supabase/database.types';

/** Server-component / server-action Supabase client (anon key + user session). */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component - safe to ignore when the
            // proxy is refreshing sessions.
          }
        },
      },
    },
  );
}

/** Current authenticated user or null. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The signed-in user, resolved ONCE per server render.
 *
 * `auth.getUser()` is always a network call — it asks GoTrue to verify the
 * token rather than trusting the cookie — and a single signed-in page ran it
 * three times over: the root layout for the theme, the header bell for its
 * badge, and the page itself. Those are serial, cross-region round trips
 * before any HTML is flushed. React's `cache` scopes one result to one
 * request, so the three become one.
 *
 * It is still `auth.getUser()`: identity comes from GoTrue verifying the
 * token, never from a cookie this process decided to believe. Memoising it
 * changes how many times that verification happens in one render, not what it
 * is allowed to conclude.
 *
 * RENDER ONLY. Never call this from a server action or a route handler that
 * mutates. Those must call `createClient().auth.getUser()` directly: an action
 * can change the very state it is authorizing against — sign-in, sign-out, a
 * moderation write — and reusing an identity captured earlier in the same
 * request is exactly the class of bug `docs/AUTH.md` and `docs/SECURITY.md`
 * exist to prevent. The saving here is on the read path, which has no such
 * hazard.
 */
export const getRenderUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
