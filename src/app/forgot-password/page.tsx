import Link from 'next/link';
import type { Metadata } from 'next';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-black text-ink">Reset your password</h1>
      <p className="mt-3 text-ink-soft">
        Enter your email or username. We’ll send recovery instructions when the
        account has a reachable email.
      </p>
      <ForgotPasswordForm />
      <Link href="/login" className="mt-5 text-sm font-bold text-terracotta">
        Back to sign in
      </Link>
    </main>
  );
}
