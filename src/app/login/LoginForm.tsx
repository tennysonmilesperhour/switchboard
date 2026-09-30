'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import {
  createPasswordAccount,
  resendEmailConfirmation,
  signInWithPasswordIdentifier,
  type AuthActionResult,
} from '@/lib/actions/auth';
import { errorFor, errorRef, type ErrorCode } from '@/lib/errors';
import {
  PASSWORD_MIN_LENGTH,
  normalizeIdentifier,
} from '@/lib/auth-identity';
import { createClient } from '@/lib/supabase/client';
import { COMMUNITY_COVENANT_SUMMARY } from '@/lib/legal';
import { supportEmail } from '@/lib/contact';

type Mode = 'signin' | 'create';
type Status = 'idle' | 'submitting' | 'error';

const initialCreateState: AuthActionResult = { ok: false };

interface LoginFormProps {
  /** Same-origin path to land on after auth. Pre-validated by the page. */
  next?: string;
  /** Which tab to open on first render. */
  initialMode?: Mode;
}

export function LoginForm({ next = '/', initialMode = 'signin' }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  // The next step and the code that go with `message`, when the failure carried
  // them. Rendered together so a screenshot of this card is the whole diagnosis.
  const [fix, setFix] = useState<string | null>(null);
  const [code, setCode] = useState<ErrorCode | null>(null);
  // Set when sign-in failed *only* because the address was never confirmed.
  // Holds the address the link goes to, so the resend can't be retargeted.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [ready, setReady] = useState(false);
  // OAuth kicks off a full-page redirect, so it needs its own feedback that
  // lives outside the sign-in/create forms (the button sits below both).
  const [oauthPending, setOauthPending] = useState(false);
  const [oauthError, setOauthError] = useState<ErrorCode | ''>('');
  const [createState, createAction, creating] = useActionState(
    createPasswordAccount,
    initialCreateState,
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // A username account is signed in the moment it's created, so send them
  // straight on (into onboarding, then wherever they were headed) instead of
  // asking them to sign in again. A full navigation picks up the fresh session
  // cookies the server action just set.
  useEffect(() => {
    if (createState.ok && createState.signedIn && createState.redirectTo) {
      window.location.assign(createState.redirectTo);
    }
  }, [createState]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('Checking your account...');
    setFix(null);
    setCode(null);
    setUnconfirmedEmail(null);

    try {
      const result = await Promise.race([
        signInWithPasswordIdentifier({ identifier, password }),
        new Promise<AuthActionResult>((resolve) =>
          window.setTimeout(
            () => resolve({
              ok: false,
              error: 'Sign-in took too long. Check your connection and try again.',
            }),
            8_000,
          ),
        ),
      ]);

      if (!result.ok) {
        setMessage(result.error ?? 'That email, username, or password did not work.');
        setFix(result.fix ?? null);
        setCode(result.code ?? null);
        if (result.needsEmailConfirmation) {
          setUnconfirmedEmail(result.identifier ?? normalizeIdentifier(identifier));
        }
        setStatus('error');
        return;
      }

      // Sign-in succeeded. The 8s guard above only covers the server action —
      // it does NOT cover this navigation, and a pending navigation keeps this
      // document painted, so anything that stops the next page from committing
      // leaves the button spinning "Signing in..." with no error at all. Say
      // something actionable instead of thinking forever.
      window.location.assign(next);
      window.setTimeout(() => {
        setMessage('You are signed in, but the app did not finish loading. Reload to continue.');
        setStatus('error');
      }, 10_000);
    } catch {
      setMessage('Sign-in could not connect. Check your connection and try again.');
      setStatus('error');
    }
  }

  // Submit from here rather than letting the `action` prop do it: React resets
  // a form's uncontrolled fields after every `action` submission, failed ones
  // included, so "That username is already taken." used to wipe the name,
  // username, password and both agreements. A prevented submit that starts its
  // own transition skips that reset, so only the field that was wrong needs
  // retyping. `action` stays on the form for submits made before hydration.
  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => createAction(formData));
  }

  async function resendConfirmation() {
    if (!unconfirmedEmail) return;
    setResending(true);
    try {
      const result = await resendEmailConfirmation(unconfirmedEmail);
      if (result.ok) {
        setUnconfirmedEmail(null);
        setFix(null);
        setCode(null);
        setStatus('idle');
        setMessage(
          `A fresh confirmation link is on its way to ${unconfirmedEmail}. Open it and you’ll be signed in — check spam if it isn’t there in a few minutes.`,
        );
        return;
      }
      setMessage(result.error ?? 'That link could not be sent.');
      setFix(result.fix ?? null);
      setCode(result.code ?? null);
      setStatus('error');
    } catch {
      setMessage('That link could not be sent. Check your connection and try again.');
      setStatus('error');
    } finally {
      setResending(false);
    }
  }

  async function signInWithGoogle() {
    setOauthError('');
    setOauthPending(true);
    const supabase = createClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) {
      setOauthError('SB-OAUTH-START');
      setOauthPending(false);
      return;
    }
    window.location.assign(data.url);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage('');
    setFix(null);
    setCode(null);
    setUnconfirmedEmail(null);
    setStatus('idle');
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="grid grid-cols-2 rounded-card border border-line bg-cream p-1">
        <button
          type="button"
          onClick={() => switchMode('signin')}
          className={`rounded-btn px-3 py-2 text-sm font-bold transition ${
            mode === 'signin' ? 'bg-card text-ink shadow-soft' : 'text-ink-soft'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode('create')}
          className={`rounded-btn px-3 py-2 text-sm font-bold transition ${
            mode === 'create' ? 'bg-card text-ink shadow-soft' : 'text-ink-soft'
          }`}
        >
          Create account
        </button>
      </div>

      {mode === 'signin' ? (
        <form onSubmit={signIn} className="space-y-3">
          <label htmlFor="username" className="sr-only">
            Email or username
          </label>
          <input
            id="username"
            name="identifier"
            type="text"
            required
            autoComplete="username"
            placeholder="email or username"
            value={identifier}
            onChange={(e) => setIdentifier(normalizeIdentifier(e.target.value))}
            className="w-full rounded-card border border-line bg-card px-4 py-3.5 text-ink placeholder:text-ink-faint outline-none focus:border-terracotta transition-colors"
          />

          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <PasswordInput
            id="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {message ? (
            <div
              role={status === 'error' ? 'alert' : 'status'}
              className={`text-sm ${
                status === 'error' ? 'text-rose-deep' : 'text-sage-deep'
              }`}
            >
              <p>{message}</p>
              {fix ? <p className="mt-1 text-ink-soft">{fix}</p> : null}
              {code === 'SB-AUTH-SUSPENDED' ? (
                // Nothing on this form can lift a suspension, so the next step
                // is a person (docs/AUTH.md: every blocked state needs a route
                // out the reader can reach from here).
                <p className="mt-1 text-ink-soft">
                  If you think this is a mistake, email{' '}
                  <a className="font-bold underline" href={`mailto:${supportEmail()}`}>
                    {supportEmail()}
                  </a>
                  .
                </p>
              ) : null}
              {code ? (
                <p className="mt-1 text-xs text-ink-faint">{errorRef(code)}</p>
              ) : null}
              {unconfirmedEmail ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="mt-3 w-full"
                  disabled={resending}
                  aria-busy={resending}
                  onClick={resendConfirmation}
                >
                  {resending ? 'Sending…' : 'Resend confirmation email'}
                </Button>
              ) : null}
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!ready || status === 'submitting'}
            aria-busy={status === 'submitting'}
          >
            {status === 'submitting' ? 'Signing in...' : 'Sign in'}
          </Button>
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm font-bold text-terracotta-deep">
              Forgot password?
            </Link>
          </div>
        </form>
      ) : createState.ok && createState.username ? (
        <div className="rounded-card bg-sage-soft p-5 animate-rise">
          <p className="font-medium text-sage-deep">Account created.</p>
          <p className="mt-1 text-sm text-ink-soft">
            {createState.signedIn ? (
              <>Signing you in…</>
            ) : createState.requiresEmailVerification ? (
              <>
                Check <strong>{createState.identifier}</strong> for a confirmation link — look in
                spam and promotions too. The account cannot sign in until that email is
                confirmed; if the link never arrives, try signing in and use the resend button.
              </>
            ) : (
              <>
                Sign in as <strong>{createState.identifier ?? `@${createState.username}`}</strong> with
                the password you just chose.
              </>
            )}
          </p>
          {!createState.signedIn && !createState.requiresEmailVerification && (
            <Button
              type="button"
              size="lg"
              className="mt-4 w-full"
              onClick={() => {
                setIdentifier(createState.identifier ?? createState.username ?? '');
                setPassword('');
                setMessage('');
                setStatus('idle');
                setMode('signin');
              }}
            >
              Sign in
            </Button>
          )}
        </div>
      ) : (
        <form action={createAction} onSubmit={submitCreate} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="display_name" className="sr-only">
            Your name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            autoComplete="name"
            placeholder="Your name"
            className="w-full rounded-card border border-line bg-card px-4 py-3.5 text-ink placeholder:text-ink-faint outline-none focus:border-terracotta transition-colors"
          />

          <label htmlFor="create_identifier" className="sr-only">
            Email or username
          </label>
          <input
            id="create_identifier"
            name="identifier"
            type="text"
            required
            autoComplete="username"
            title="Use an email address or a username with 3-24 lowercase letters, numbers, or underscores."
            placeholder="email or username"
            onChange={(e) => {
              e.currentTarget.value = normalizeIdentifier(e.currentTarget.value);
            }}
            className="w-full rounded-card border border-line bg-card px-4 py-3.5 text-ink placeholder:text-ink-faint outline-none focus:border-terracotta transition-colors"
          />

          <label htmlFor="create_password" className="sr-only">
            Password
          </label>
          <PasswordInput
            id="create_password"
            name="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            placeholder="Password"
          />

          <div className="rounded-card border border-line bg-cream p-4 text-sm text-ink-soft">
            <p className="font-bold text-ink">Before you join</p>
            <p className="mt-1 leading-relaxed">
              Switchboard is for people who are trying to create safer, warmer,
              more nourishing human connection.
            </p>
            <ul className="mt-3 space-y-1.5">
              {COMMUNITY_COVENANT_SUMMARY.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-terracotta-deep">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <label className="mt-4 flex items-start gap-2">
              <input
                type="checkbox"
                name="community_agreement"
                required
                className="mt-1 size-4 accent-terracotta"
              />
              <span>
                I agree to use Switchboard with kindness, curiosity, openness,
                generous assumptions, and respect for each matching context.
              </span>
            </label>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                name="terms_agreement"
                required
                className="mt-1 size-4 accent-terracotta"
              />
              <span>
                I confirm I am at least 18 years old and agree to the{' '}
                <Link href="/terms" className="font-bold text-terracotta-deep">Terms</Link>
                ,{' '}
                <Link href="/privacy" className="font-bold text-terracotta-deep">Privacy Notice</Link>
                , and{' '}
                <Link href="/community" className="font-bold text-terracotta-deep">Community Covenant</Link>
                .
              </span>
            </label>
          </div>

          {createState.error ? (
            <div role="alert" className="text-sm text-rose-deep">
              <p>{createState.error}</p>
              {createState.fix ? <p className="mt-1 text-ink-soft">{createState.fix}</p> : null}
              {createState.code ? (
                <p className="mt-1 text-xs text-ink-faint">{errorRef(createState.code)}</p>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={creating}>
            {creating ? 'Creating...' : 'Create account'}
          </Button>
        </form>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={oauthPending}
        aria-busy={oauthPending}
        onClick={signInWithGoogle}
      >
        {oauthPending ? 'Connecting to Google…' : 'Continue with Google'}
      </Button>
      {oauthError ? (
        <div role="alert" className="text-sm text-rose-deep">
          <p>{errorFor(oauthError).message}</p>
          {errorFor(oauthError).fix ? (
            <p className="mt-1 text-ink-soft">{errorFor(oauthError).fix}</p>
          ) : null}
          <p className="mt-1 text-xs text-ink-faint">{errorRef(oauthError)}</p>
        </div>
      ) : null}
    </div>
  );
}
