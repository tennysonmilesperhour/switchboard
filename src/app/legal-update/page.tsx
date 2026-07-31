import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { acceptLatestTerms } from '@/lib/actions/profile';
import { LEGAL_VERSION } from '@/lib/legal';
import { safeNextPath } from '@/lib/security';
import { Button } from '@/components/ui/Button';

export const metadata = { title: 'Review updated terms' };

export default async function LegalUpdatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = safeNextPath(next, '/');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/legal-update')}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('legal_terms_version')
    .eq('id', user.id)
    .maybeSingle<{ legal_terms_version: string | null }>();
  if (profile?.legal_terms_version === LEGAL_VERSION) redirect(destination);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-6 py-12">
      <div className="w-full rounded-card border border-line bg-card p-6 shadow-lift">
        <p className="text-sm font-bold uppercase tracking-wide text-terracotta-deep">
          One quick safety update
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink">Switchboard is for adults</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Accounts are now limited to people 18 and older. Plans can still be
          family-friendly and include children, but an adult must own and manage the account.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Please review the updated <Link className="font-bold underline" href="/terms">Terms</Link>,{' '}
          <Link className="font-bold underline" href="/privacy">Privacy Notice</Link>, and{' '}
          <Link className="font-bold underline" href="/community">Community Covenant</Link>.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm font-semibold text-rose-deep">
            {error === 'agreement'
              ? 'Confirm the age and terms statement to continue.'
              : 'We could not save your acceptance. Please try again.'}
          </p>
        )}
        <form action={acceptLatestTerms} className="mt-6 space-y-5">
          <input type="hidden" name="next" value={destination} />
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="terms_agreement"
              required
              className="mt-0.5 size-4 accent-terracotta"
            />
            <span>I confirm I am at least 18 years old and accept the updated terms.</span>
          </label>
          <Button type="submit" size="lg" className="w-full">Continue</Button>
        </form>
      </div>
    </main>
  );
}
