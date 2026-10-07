import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/security';
import { confirmFactVerification } from '@/lib/actions/facts';
import { SignOutForm } from '@/components/shell/SignOutForm';
import { Button } from '@/components/ui/Button';

/** `requestFactVerification` mints 43 characters; the action refuses under 32. */
const MIN_TOKEN_LENGTH = 32;

export default async function VerifyFactPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; reason?: string }>;
}) {
  const { token = '', reason } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const returnPath = safeNextPath(`/verify-fact?token=${encodeURIComponent(token)}`, '/profile/edit');
  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);

  const otherAccount = reason === 'other-account';
  const incomplete = token.length < MIN_TOKEN_LENGTH;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-black tracking-tight text-ink">Confirm your school or work</h1>
      {otherAccount ? (
        <div role="alert" className="mt-4 rounded-card bg-rose-soft p-4 text-sm">
          <p className="font-bold text-rose-deep">
            This link belongs to a different Switchboard account.
          </p>
          <p className="mt-1 leading-relaxed text-ink-soft">
            It was sent for the account that asked for it, not the one you’re signed into now.
            Sign out, sign in as that account, then open the link from the email again. It works
            for 30 minutes after it was sent.
          </p>
          <SignOutForm>
            <Button type="submit" variant="secondary" size="lg" className="mt-4 w-full">
              Sign out
            </Button>
          </SignOutForm>
        </div>
      ) : incomplete ? (
        <div role="alert" className="mt-4 rounded-card bg-rose-soft p-4 text-sm">
          <p className="font-bold text-rose-deep">This link looks incomplete.</p>
          <p className="mt-1 leading-relaxed text-ink-soft">
            Part of it was probably cut off. Open the full link from the email, tapping it
            rather than copying it, or send yourself a new one from Edit profile.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            This confirms the entry on your profile against the email domain you used. Switchboard
            keeps the domain, not the address, and shows the entry as confirmed by email.
          </p>
          <form action={confirmFactVerification} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <Button type="submit" size="lg" className="w-full">
              Confirm
            </Button>
          </form>
        </>
      )}
      <Link href="/profile/edit" className="mt-4 text-center text-sm font-bold text-terracotta-deep">
        Back to your profile
      </Link>
    </main>
  );
}
