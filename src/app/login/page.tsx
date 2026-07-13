import Link from 'next/link';
import type { Metadata } from 'next';
import { safeNextPath } from '@/lib/security';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string }>;
}) {
  const { error, next, mode } = await searchParams;
  // Where to send the visitor after they authenticate. Validate the raw param
  // so it can't be turned into an open redirect (e.g. `next=//evil.com`).
  const nextPath = safeNextPath(next, '/');
  const initialMode = mode === 'create' ? 'create' : 'signin';

  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="py-6">
        <Link
          href="/welcome"
          className="text-xl font-extrabold lowercase tracking-tight text-terracotta"
        >
          switchboard
        </Link>
      </header>
      <main className="flex-1 flex flex-col justify-center pb-24">
        <h1 className="text-5xl font-black tracking-tight text-ink">Welcome.</h1>
        <p className="mt-3 text-ink-soft leading-relaxed">
          Sign in with your email or Switchboard username.
        </p>
        {error ? (
          <p role="alert" className="mt-4 rounded-card bg-rose-soft text-rose-deep text-sm p-3">
            That sign-in attempt didn’t work. Try again.
          </p>
        ) : null}
        <LoginForm next={nextPath} initialMode={initialMode} />
      </main>
    </div>
  );
}
