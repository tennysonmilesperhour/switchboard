import Link from 'next/link';
import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg min-h-dvh flex flex-col px-6">
      <header className="py-6">
        <Link href="/welcome" className="font-display text-xl">
          Switchboard
        </Link>
      </header>
      <main className="flex-1 flex flex-col justify-center pb-24">
        <h1 className="font-display text-4xl text-ink">Welcome.</h1>
        <p className="mt-3 text-ink-soft leading-relaxed">
          Sign in with a magic link - no password to remember.
        </p>
        {error ? (
          <p role="alert" className="mt-4 rounded-card bg-rose-soft text-rose-deep text-sm p-3">
            That sign-in link didn’t work. Try again.
          </p>
        ) : null}
        <LoginForm />
      </main>
    </div>
  );
}
