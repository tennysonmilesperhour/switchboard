import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { joinBoardViaCode } from '@/lib/actions/boards';
import { errorFor, errorRef } from '@/lib/errors';
import { Glyph } from '@/components/ui/Glyph';

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

  // An unknown or replaced code is the reader's dead end; a lookup that failed
  // is ours, and saying "this link doesn't match" for it sent people back to
  // ask for a new link that would have failed the same way.
  const dead = errorFor(result.code ?? 'SB-BOARD-UNKNOWN');

  return (
    <AppShell title="Join board" back="/boards">
      <div className="rounded-card border border-line bg-card p-6 text-center">
        <Glyph emoji="🏘️" size={40} className="mx-auto text-ink-soft" />
        <h2 className="mt-3 text-xl font-black text-ink">{dead.message}</h2>
        {dead.fix && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{dead.fix}</p>}
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
          {errorRef(dead.code)}
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
