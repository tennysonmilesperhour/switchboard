'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
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

type Mode = 'signin' | 'create';
type Status = 'idle' | 'submitting' | 'error';

const initialCreateState: AuthActionResult = { ok: false };

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [createState, createAction, creating] = useActionState(
    createPasswordAccount,
    initialCreateState,
  );

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');

    try {
      const result = await Promise.race([
        signInWithPasswordIdentifier({ identifier, password }),
        new Promise<AuthActionResult>((resolve) =>
          window.setTimeout(
            () => resolve({
              ok: false,
              error: 'Sign-in took too long. Check your connection and try again.',
            }),
            15_000,
          ),
        ),
      ]);

      if (!result.ok) {
        setMessage(result.error ?? 'That email, username, or password did not work.');
        setStatus('error');
        return;
      }

      window.location.assign('/');
    } catch {
      setMessage('Sign-in could not connect. Check your connection and try again.');
      setStatus('error');
    }
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
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
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-card border border-line bg-card px-4 py-3.5 text-ink placeholder:text-ink-faint outline-none focus:border-terracotta transition-colors"
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
            disabled={status === 'submitting'}
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
            Sign in as <strong>{createState.identifier ?? `@${createState.username}`}</strong> with the password
            you just chose.
          </p>
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
        </div>
      ) : (
        <form action={createAction} className="space-y-3">
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
          <input
            id="create_password"
            name="password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            placeholder="Password"
            className="w-full rounded-card border border-line bg-card px-4 py-3.5 text-ink placeholder:text-ink-faint outline-none focus:border-terracotta transition-colors"
          />

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
        onClick={signInWithGoogle}
      >
        Continue with Google
      </Button>
    </div>
  );
}
