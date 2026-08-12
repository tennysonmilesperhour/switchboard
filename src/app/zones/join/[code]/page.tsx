import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { joinZoneViaCode } from '@/lib/actions/zones';
import { errorFor, errorRef } from '@/lib/errors';

export const metadata = { title: 'Join zone' };

/**
 * Landing page for a shared zone invite link, mirroring the board one: a
 * signed-in visitor joins and is sent straight to the zone, a signed-out
 * visitor is bounced through login and returned here, and a rotated or unknown
 * code gets a dead end that says so rather than a bare 404.
 */
export default async function JoinZonePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/zones/join/${encodeURIComponent(code)}`);

  const result = await joinZoneViaCode(code);
  if (result.ok && result.slug) redirect(`/zones/${result.slug}`);

  const dead = errorFor('SB-ZONE-UNKNOWN');

  return (
    <AppShell title="Join zone" back="/zones">
      <div className="rounded-card border border-line bg-card p-6 text-center">
        <p className="text-4xl" aria-hidden>
          🎪
        </p>
        <h2 className="mt-3 text-xl font-black text-ink">{dead.message}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{dead.fix}</p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
          {errorRef(dead.code)}
        </p>
        <Link
          href="/zones"
          className="mt-5 inline-block rounded-pill bg-terracotta px-5 py-2.5 text-sm font-bold text-paper"
        >
          Back to zones
        </Link>
      </div>
    </AppShell>
  );
}
