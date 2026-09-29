import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { safeNextPath } from '@/lib/security';

/**
 * Verifies an emailed one-time link (password recovery, email change, signup
 * confirmation) by exchanging its token_hash for a session, then forwards on.
 * This is the target of Supabase's SSR-style email templates
 * (`/auth/confirm?token_hash=...&type=...`); without it, recovery links 404.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  // Recovery lands on the password form by default, even if the email template
  // didn't pass an explicit next. Validate it so `next` can't be turned into an
  // open redirect that carries the freshly-established session off-site.
  const next = safeNextPath(
    searchParams.get('next'),
    type === 'recovery' ? '/reset-password' : '/',
  );

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // A signup confirmation proves control of the real auth email. Mirror
      // that proof into contact matching; synthetic username emails are never
      // contact identifiers. A magic link is the same proof by a different
      // route — it's what a re-sent confirmation uses — so it counts too.
      if (
        (type === 'signup' || type === 'email' || type === 'magiclink') &&
        hasAdminCredentials()
      ) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email && !user.email.endsWith('@users.switchboard.local')) {
          await createAdminClient()
            .from('profile_contacts')
            .update({
              verified_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .eq('kind', 'email')
            .eq('normalized_value', user.email.toLowerCase());
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Keep where the link was taking them. An expired confirmation opened from a
  // deep link used to lose the destination, so signing in afterwards landed
  // on Home instead of the invitation that started it all (docs/AUTH.md,
  // decision 15). `next` is already validated above.
  const login = new URL('/login', origin);
  login.searchParams.set('error', 'auth');
  login.searchParams.set('reason', 'expired-link');
  if (type === 'recovery') {
    login.searchParams.set('type', 'recovery');
  } else if (next !== '/') {
    login.searchParams.set('next', next);
  }
  return NextResponse.redirect(login.toString());
}
