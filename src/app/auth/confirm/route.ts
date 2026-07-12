import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=auth&reason=expired-link`,
  );
}
