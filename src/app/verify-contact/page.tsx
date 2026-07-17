import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/security';
import { confirmEmailContact } from '@/lib/actions/contact-verification';
import { Button } from '@/components/ui/Button';

export default async function VerifyContactPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const returnPath = safeNextPath(`/verify-contact?token=${encodeURIComponent(token)}`, '/settings');
  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-black tracking-tight text-ink">Verify your email</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Confirm that this email belongs to you before Switchboard uses it for contact matching
        or invitation routing.
      </p>
      <form action={confirmEmailContact} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" size="lg" className="w-full" disabled={token.length < 32}>
          Verify email
        </Button>
      </form>
      <Link href="/settings" className="mt-4 text-center text-sm font-bold text-terracotta-deep">
        Back to settings
      </Link>
    </main>
  );
}
