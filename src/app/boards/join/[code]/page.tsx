import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { joinBoardViaCode } from '@/lib/actions/boards';

export const metadata = { title: 'Join board' };

/**
 * Landing page for a shared board invite link. A signed-in visitor is joined to
 * the board and sent straight there; a signed-out visitor is bounced through
 * login and returned here; an unknown/rotated code shows a friendly dead end.
 */
export default async function JoinBoardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/boards/join/${encodeURIComponent(code)}`);

  const result = await joinBoardViaCode(code);
  if (result.ok && result.slug) redirect(`/boards/${result.slug}`);

  return (
    <AppShell title="Join board" back="/boards">
      <div className="rounded-card border border-line bg-card p-6 text-center">
        <p className="text-4xl" aria-hidden>
          🏘️
        </p>
        <h2 className="mt-3 text-xl font-black text-ink">This link isn’t active</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          This board invite may have been turned off or replaced with a new link.
          Ask whoever shared it for an up-to-date one.
        </p>
        <Link
          href="/boards"
          className="mt-5 inline-block rounded-pill bg-terracotta px-5 py-2.5 text-sm font-bold text-paper"
        >
          Back to boards
        </Link>
      </div>
    </AppShell>
  );
}
