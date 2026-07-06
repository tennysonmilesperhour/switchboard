import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from './OnboardingForm';

export const metadata: Metadata = { title: 'Set up your profile' };

const ERROR_MESSAGES: Record<string, string> = {
  name: 'Please tell us your name.',
  handle: 'Handles are 3-24 characters: lowercase letters, numbers, underscores.',
  handle_taken: 'That handle is taken - try another.',
  save: 'Something went wrong saving your profile. Try again.',
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, handle, interests, onboarded')
    .eq('id', user.id)
    .single();

  if (profile?.onboarded) redirect('/');

  return (
    <div className="mx-auto max-w-lg min-h-dvh px-6 py-8">
      <p className="text-sm font-bold tracking-wide uppercase text-terracotta">
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
        </p>
      ) : null}
      <OnboardingForm
        initialName={profile?.display_name ?? ''}
        initialHandle={profile?.handle ?? ''}
      />
    </div>
  );
}
