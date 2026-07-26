import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/security';

function loginErrorUrl(origin: string, error: string, next: string): string {
  const url = new URL('/login', origin);
  url.searchParams.set('error', error);
  if (next !== '/') url.searchParams.set('next', next);
  return url.toString();
}

/** OAuth code exchange. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const providerError = searchParams.get('error');
  const providerErrorDescription = searchParams.get('error_description');
  // Validate `next` so an attacker-supplied value can't turn this into an open
  // redirect (e.g. `next=@evil.com` -> `${origin}@evil.com`).
  const next = safeNextPath(searchParams.get('next'), '/');

  if (providerError) {
    console.error('[auth:oauth-provider:error]', {
      code: providerError,
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
    console.error('[auth:oauth-exchange:error]', {
      code: error.code ?? 'unknown',
      status: error.status ?? null,
    });
    return NextResponse.redirect(loginErrorUrl(origin, 'oauth_exchange', next));
  }
  console.error('[auth:oauth-callback:error]', { code: 'missing_code' });
  return NextResponse.redirect(loginErrorUrl(origin, 'oauth_missing_code', next));
}
