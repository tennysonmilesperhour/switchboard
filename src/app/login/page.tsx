import Link from 'next/link';
import type { Metadata } from 'next';
import { safeNextPath } from '@/lib/security';
import { errorFor, errorRef, type ErrorCode } from '@/lib/errors';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * `?error=` values the auth routes redirect here with, and the code each one
 * shows. Google's three ways of ending short used to be three sentences with
 * no code, so a screenshot of one could not be matched to its log line (the
 * callback logs the same code).
 */
const ERROR_CODES: Record<string, ErrorCode> = {
  oauth_provider: 'SB-OAUTH-DENIED',
  oauth_exchange: 'SB-OAUTH-EXCHANGE',
  oauth_missing_code: 'SB-OAUTH-MISSING',
  auth: 'SB-AUTH-LINK',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    reason?: string;
    next?: string;
    mode?: string;
    type?: string;
  }>;
}) {
  const { error, reason, next, mode, type } = await searchParams;
  // Where to send the visitor after they authenticate. Validate the raw param
  // so it can't be turned into an open redirect (e.g. `next=//evil.com`).
  const nextPath = safeNextPath(next, '/');
  const initialMode = mode === 'create' ? 'create' : 'signin';
  const expiredLink = reason === 'expired-link';
  const code = error ? (ERROR_CODES[error] ?? 'SB-AUTH-SIGNIN') : null;
  const entry = code ? errorFor(code) : null;

  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="py-6">
        <Link
          href="/welcome"
          className="text-xl font-extrabold lowercase tracking-tight text-terracotta-deep"
        >
          switchboard
        </Link>
      </header>
      <main className="flex-1 flex flex-col justify-center pb-24">
        <h1 className="text-5xl font-black tracking-tight text-ink">Welcome.</h1>
        <p className="mt-3 text-ink-soft leading-relaxed">
          Sign in with your email or Switchboard username.
        </p>
        {entry ? (
          <div role="alert" className="mt-4 rounded-card bg-rose-soft text-rose-deep text-sm p-3">
            {expiredLink && type === 'recovery' ? (
              // A reset link only exists because the password was forgotten,
              // so "sign in below" is no route out; a fresh link is.
              <p>
                That password-reset link has expired or was already used.{' '}
                <Link href="/forgot-password" className="font-bold underline underline-offset-2">
                  Request a fresh one
                </Link>
                .
              </p>
            ) : expiredLink ? (
              <>
                <p>{entry.message}</p>
                <p className="mt-1 text-ink-soft">
                  If you already confirmed, just sign in below. Otherwise sign in anyway and
                  you’ll be offered a fresh confirmation link — or{' '}
                  <Link href="/forgot-password" className="font-bold underline underline-offset-2">
                    reset your password
                  </Link>
                  , which confirms the address too.
                </p>
              </>
            ) : (
              <>
                <p>{entry.message}</p>
                {entry.fix ? <p className="mt-1 text-ink-soft">{entry.fix}</p> : null}
              </>
            )}
            <p className="mt-1 text-xs text-ink-faint">{errorRef(entry.code)}</p>
          </div>
        ) : null}
        <LoginForm next={nextPath} initialMode={initialMode} />
      </main>
    </div>
  );
}
