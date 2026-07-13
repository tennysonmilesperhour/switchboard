import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage() {
  // A valid reset link establishes a recovery session (via /auth/confirm) before
  // landing here. If there's no session, the visitor opened this page directly —
  // show guidance instead of a form that can only fail on submit.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-black text-ink">Choose a new password</h1>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="mt-4 rounded-card bg-cream p-4 text-sm text-ink-soft">
          <p>
            Open the reset link from your email first — it signs you in so you can
            set a new password.
          </p>
          <Link
            href="/forgot-password"
            className="mt-3 inline-block font-bold text-terracotta"
          >
            Request a fresh reset link →
          </Link>
        </div>
      )}
    </main>
  );
}
