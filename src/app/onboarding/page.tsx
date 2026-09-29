import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/security';
import { OnboardingForm } from './OnboardingForm';
import { errorRef } from '@/lib/errors';
import { SignOutForm } from '@/components/shell/SignOutForm';

export const metadata: Metadata = { title: 'Set up your profile' };

const ERROR_MESSAGES: Record<string, string> = {
  name: 'Please tell us your name.',
  handle: 'Handles are 3-24 characters: lowercase letters, numbers, underscores.',
  handle_taken: 'That handle is taken - try another.',
  agreement: 'Please acknowledge the Terms, Privacy Notice, and Community Covenant.',
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, handle, interests, onboarded')
    .eq('id', user.id)
    .single();

  if (profile?.onboarded) redirect(nextPath);

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
      <OnboardingForm
        initialName={profile?.display_name ?? ''}
        initialHandle={profile?.handle ?? ''}
        next={nextPath}
        error={error}
      />
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
