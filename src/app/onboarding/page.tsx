import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/security';
import { OnboardingForm } from './OnboardingForm';
import { errorFor, errorRef } from '@/lib/errors';
import { SignOutForm } from '@/components/shell/SignOutForm';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { reportOperationalError } from '@/lib/server/observability';
import { USERNAME_EMAIL_DOMAIN } from '@/lib/auth-identity';

export const metadata: Metadata = { title: 'Set up your profile' };

const ERROR_MESSAGES: Record<string, string> = {
  name: 'Please tell us your name.',
  handle: 'Handles are 3-24 characters: lowercase letters, numbers, underscores.',
  handle_taken: 'That handle is taken - try another.',
  agreement: 'Please acknowledge the Terms, Privacy Notice, and Community Covenant.',
  recovery_email: 'That recovery email looks off — check it, or leave it blank for now.',
  save: 'Something went wrong saving your profile. Try again.',
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const nextPath = safeNextPath(next, '/');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const onboardingPath = `/onboarding?next=${encodeURIComponent(nextPath)}`;
    redirect(`/login?next=${encodeURIComponent(onboardingPath)}`);
  }

  // maybeSingle: no row is an account whose profile trigger never ran, and
  // onboarding is how it gets one (docs/AUTH.md finding 3). A failed read is
  // different — rendering the form then would offer to overwrite a saved name
  // and handle with blanks — so it says what happened instead.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, handle, interests, onboarded')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    await reportOperationalError('onboarding.load', profileError, { userId: user.id });
  }

  if (profile?.onboarded) redirect(nextPath);

  // Username sign-ups have a synthetic login address and nothing to recover
  // a forgotten password with, so onboarding offers them one optional step.
  const usernameAccount = (user.email ?? '').toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
  const loadFailure = errorFor('SB-PROFILE-LOAD');

  return (
    <div className="mx-auto max-w-lg min-h-dvh px-6 py-8">
      <p className="text-sm font-bold tracking-wide uppercase text-terracotta-deep">
        Welcome to Switchboard
      </p>
      <h1 className="text-4xl font-black tracking-tight text-ink mt-2">
        First, a little about you.
      </h1>
      <p className="mt-2 text-ink-soft text-sm leading-relaxed">
        Your name and handle help friends find you. Interests help Switchboard
        suggest things you’ll actually enjoy.
      </p>
      {error ? (
        <p role="alert" className="mt-4 rounded-card bg-rose-soft text-rose-deep text-sm p-3">
          {ERROR_MESSAGES[error] ?? 'Something went wrong.'}
          {error === 'save' || !ERROR_MESSAGES[error] ? (
            <span className="mt-1 block font-mono text-[11px] uppercase tracking-wide opacity-70">
              {errorRef('SB-PROFILE-SAVE')}
            </span>
          ) : null}
        </p>
      ) : null}
      {profileError ? (
        <div role="alert" className="mt-6 rounded-card border border-line bg-card p-4">
          <ErrorNotice
            message={loadFailure.message}
            fix={loadFailure.fix}
            code={loadFailure.code}
          />
        </div>
      ) : (
        <OnboardingForm
          initialName={profile?.display_name ?? ''}
          initialHandle={profile?.handle ?? ''}
          next={nextPath}
          error={error}
          askRecoveryEmail={usernameAccount}
        />
      )}
      {/* Every protected route funnels here until this form is saved, so the
          bottom bar's Settings — and its Sign out — is out of reach. Someone
          who signed in on the wrong account, or can't agree to the terms,
          still needs a way out (docs/AUTH.md: no state is a dead end). */}
      <SignOutForm>
        <button
          type="submit"
          className="mt-6 w-full text-center text-sm font-bold text-ink-faint hover:text-ink"
        >
          Not you? Sign out
        </button>
      </SignOutForm>
    </div>
  );
}
