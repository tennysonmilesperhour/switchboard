import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/security';
import { SUSPENDED_AUTH_CODE, SUSPENDED_LOGIN_PATH } from '@/lib/suspension';
import { reportOperationalError } from '@/lib/server/observability';

function loginErrorUrl(origin: string, error: string, next: string): string {
  const url = new URL('/login', origin);
  url.searchParams.set('error', error);
  if (next !== '/') url.searchParams.set('next', next);
  return url.toString();
}

/**
 * OAuth code exchange.
 *
 * Each way this ends short is logged under the code /login shows for it
 * (SB-OAUTH-DENIED, SB-OAUTH-EXCHANGE, SB-OAUTH-MISSING), so a screenshot and
 * the log line meet on the same string.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const providerError = searchParams.get('error');
  const providerErrorDescription = searchParams.get('error_description');
  const providerErrorCode = searchParams.get('error_code');
  // Validate `next` so an attacker-supplied value can't turn this into an open
  // redirect (e.g. `next=@evil.com` -> `${origin}@evil.com`).
  const next = safeNextPath(searchParams.get('next'), '/');

  // Google said yes and the auth server refused the account because a
  // moderator suspended it. That is not a denied sign-in; say what it is.
  if (providerErrorCode === SUSPENDED_AUTH_CODE) {
    return NextResponse.redirect(`${origin}${SUSPENDED_LOGIN_PATH}`);
  }

  if (providerError) {
    await reportOperationalError('auth.oauth-provider', { code: providerError, message: 'provider returned an error' }, {
      hasDescription: Boolean(providerErrorDescription),
    });
    return NextResponse.redirect(loginErrorUrl(origin, 'oauth_provider', next));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    if (error.code === SUSPENDED_AUTH_CODE) {
      return NextResponse.redirect(`${origin}${SUSPENDED_LOGIN_PATH}`);
    }
    await reportOperationalError('auth.oauth-exchange', { code: error.code ?? 'unknown', message: 'code exchange failed' }, {
      status: error.status ?? null,
    });
    return NextResponse.redirect(loginErrorUrl(origin, 'oauth_exchange', next));
  }
  await reportOperationalError('auth.oauth-callback', { code: 'missing_code', message: 'callback had no code' });
  return NextResponse.redirect(loginErrorUrl(origin, 'oauth_missing_code', next));
}
