'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus('error');
      return;
    }
    setStatus('sent');
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  if (status === 'sent') {
    return (
      <div className="mt-8 rounded-card bg-sage-soft p-5 animate-rise">
        <p className="font-medium text-sage-deep">Check your email ✉️</p>
        <p className="mt-1 text-sm text-ink-soft">
          We sent a sign-in link to <strong>{email}</strong>. You can close
          this tab.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <form onSubmit={sendMagicLink} className="space-y-3">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-card border border-line bg-card px-4 py-3.5 text-ink placeholder:text-ink-faint outline-none focus:border-terracotta transition-colors"
        />
        {status === 'error' ? (
          <p role="alert" className="text-sm text-rose-deep">
            {errorMessage}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={status === 'sending'}
        >
          {status === 'sending' ? 'Sending…' : 'Email me a magic link'}
        </Button>
      </form>
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
