import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/security';
import { confirmEmailContact } from '@/lib/actions/contact-verification';
import { SignOutForm } from '@/components/shell/SignOutForm';
import { Button } from '@/components/ui/Button';

/** Anything shorter was cut off: `requestContactVerification` mints 43 characters,
 *  and `confirmEmailContact` refuses under 32. */
const MIN_TOKEN_LENGTH = 32;

export default async function VerifyContactPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; reason?: string }>;
}) {
  const { token = '', reason } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const returnPath = safeNextPath(`/verify-contact?token=${encodeURIComponent(token)}`, '/settings');
  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);

  // Set by `confirmEmailContact` when the link belongs to another account.
  const otherAccount = reason === 'other-account';
  const incomplete = token.length < MIN_TOKEN_LENGTH;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-black tracking-tight text-ink">Verify your email</h1>
      {otherAccount ? (
        <div role="alert" className="mt-4 rounded-card bg-rose-soft p-4 text-sm">
          <p className="font-bold text-rose-deep">
            This link belongs to a different Switchboard account.
          </p>
          <p className="mt-1 leading-relaxed text-ink-soft">
            It was sent to verify an email for the account that asked for it, not the one
            you’re signed into now. Sign out, sign in as that account, then open the link
            from the email again. It works for 30 minutes after it was sent.
          </p>
          <SignOutForm>
            <Button type="submit" variant="secondary" size="lg" className="mt-4 w-full">
              Sign out
            </Button>
          </SignOutForm>
        </div>
      ) : incomplete ? (
        // A disabled button with no explanation used to be all a truncated
        // link got — usually part of it lost to a line wrap or a copy.
        <div role="alert" className="mt-4 rounded-card bg-rose-soft p-4 text-sm">
          <p className="font-bold text-rose-deep">This verification link looks incomplete.</p>
          <p className="mt-1 leading-relaxed text-ink-soft">
            Part of it was probably cut off. Open the full link from the email — tap it
            rather than copying it — or send yourself a new one from Settings.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            Confirm that this email belongs to you before Switchboard uses it for contact
            matching or invitation routing.
          </p>
          <form action={confirmEmailContact} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <Button type="submit" size="lg" className="w-full">
              Verify email
            </Button>
          </form>
        </>
      )}
      <Link href="/settings" className="mt-4 text-center text-sm font-bold text-terracotta-deep">
        Back to settings
      </Link>
    </main>
  );
}
