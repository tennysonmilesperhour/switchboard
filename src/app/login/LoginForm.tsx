'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import {
  createPasswordAccount,
  signInWithPasswordIdentifier,
  type AuthActionResult,
} from '@/lib/actions/auth';
import {
  PASSWORD_MIN_LENGTH,
  normalizeIdentifier,
} from '@/lib/auth-identity';
import { createClient } from '@/lib/supabase/client';
import { COMMUNITY_COVENANT_SUMMARY } from '@/lib/legal';

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
  const [ready, setReady] = useState(false);
  // OAuth kicks off a full-page redirect, so it needs its own feedback that
  // lives outside the sign-in/create forms (the button sits below both).
  const [oauthPending, setOauthPending] = useState(false);
  const [oauthError, setOauthError] = useState('');
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
        setStatus('error');
        return;
      }

      window.location.assign(next);
    } catch {
      setMessage('Sign-in could not connect. Check your connection and try again.');
      setStatus('error');
    }
  }

  async function signInWithGoogle() {
    setOauthError('');
    setOauthPending(true);
    const supabase = createClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback },
    });
    // On success the browser is already navigating to Google, so this only runs
    // when kickoff failed (e.g. the Google provider isn't enabled on the
    // project). Surface it instead of leaving the click looking dead.
    if (error) {
      setOauthError(
        'Google sign-in isn’t available right now. Use your email or username instead.',
      );
      setOauthPending(false);
    }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage('');
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
            <p
              role={status === 'error' ? 'alert' : 'status'}
              className={`text-sm ${
                status === 'error' ? 'text-rose-deep' : 'text-sage-deep'
              }`}
            >
              {message}
            </p>
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
            <Link href="/forgot-password" className="text-sm font-bold text-terracotta">
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
                Check <strong>{createState.identifier}</strong> for a confirmation link. The account
                cannot sign in until that email is verified.
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
        <form action={createAction} className="space-y-3">
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
                  <span aria-hidden className="text-terracotta">•</span>
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
                I agree to the{' '}
                <Link href="/terms" className="font-bold text-terracotta">Terms</Link>
                ,{' '}
                <Link href="/privacy" className="font-bold text-terracotta">Privacy Notice</Link>
                , and{' '}
                <Link href="/community" className="font-bold text-terracotta">Community Covenant</Link>
                .
              </span>
            </label>
          </div>

          {createState.error ? (
            <p role="alert" className="text-sm text-rose-deep">
              {createState.error}
            </p>
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
        <p role="alert" className="text-sm text-rose-deep">
          {oauthError}
        </p>
      ) : null}
    </div>
  );
}
