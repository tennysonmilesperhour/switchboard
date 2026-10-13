import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { COMMUNITY_COVENANT_SUMMARY } from '@/lib/legal';
import { Glyph } from '@/components/ui/Glyph';

export const metadata: Metadata = {
  title: 'Community',
  alternates: { canonical: '/community' },
};

export default async function CommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <CommunityCovenantStandalone />;
  }

  const { data: boards } = await supabase
    .from('boards')
    .select('id, slug, name, description')
    .order('created_at', { ascending: false });

  return (
    <AppShell title="Community">
      <div className="space-y-7">
        <p className="text-sm text-ink-soft leading-relaxed -mt-1">
          Your corner of Switchboard — the boards you belong to and the social
          contract everyone on them agrees to.
        </p>

        {(boards?.length ?? 0) > 0 ? (
          <section>
            <SectionHeader
              title="Your boards"
              action={
                <Link
                  href="/boards"
                  className="text-xs font-bold text-terracotta-deep hover:underline"
                >
                  See all →
                </Link>
              }
            />
            <div className="space-y-2">
              {boards?.map((board) => (
                <Link key={board.id} href={`/boards/${board.slug}`} className="block group">
                  <Card className="group-hover:border-terracotta transition-colors">
                    <p className="flex items-center gap-1.5 font-medium">
                      <Glyph emoji="🏘️" size={16} />
                      {board.name}
                    </p>
                    {board.description && (
                      <p className="text-sm text-ink-soft mt-0.5">{board.description}</p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            emoji="🏘️"
            title="No boards yet"
            body="Boards are invite-only local groups. Ask a neighbor for a join link, or start one yourself."
            action={
              <Link
                href="/boards"
                className="mt-2 inline-block rounded-pill bg-ink px-4 py-2 text-sm font-bold text-paper"
              >
                {/* Boards are invite-only; there is nothing to browse, and the
                    page this opens is where you start one. */}
                Start a board
              </Link>
            }
          />
        )}

        <section>
          <SectionHeader title="Community Covenant" />
          <Card>
            <p className="text-sm text-ink-soft leading-relaxed mb-3">
              Switchboard exists to help people make and deepen real human
              connection. Everyone using it is expected to protect that intention.
            </p>
            <ul className="space-y-2.5 text-sm leading-relaxed text-ink-soft">
              {COMMUNITY_COVENANT_SUMMARY.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="font-bold text-terracotta-deep">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <Card tone="cream">
            <h3 className="font-bold text-sm">Matching Contexts Matter</h3>
            <p className="mt-1 text-sm text-ink-soft leading-relaxed">
              If you choose someone in a discovery category, you are saying you
              are genuinely open to the context shown. Do not use one context as
              cover for a different agenda. Curiosity is welcome. Pressure,
              deception, entitlement, harassment, and boundary-pushing are not.
            </p>
          </Card>
        </section>

        <section>
          <Card tone="cream">
            <h3 className="font-bold text-sm">Meet Up With Care</h3>
            <p className="mt-1 text-sm text-ink-soft leading-relaxed">
              Choose an appropriate public or trusted place, share your plans
              with someone you trust, and leave whenever something feels wrong.
              For kid-inclusive plans, a parent or guardian stays responsible and
              present. Never post a child&apos;s name, age, school, contact details,
              or live location.
            </p>
          </Card>
        </section>

        <div className="flex flex-wrap gap-4 text-sm font-bold text-terracotta-deep">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/copyright">Copyright</Link>
        </div>
      </div>
    </AppShell>
  );
}

function CommunityCovenantStandalone() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-sm font-bold text-terracotta-deep">Switchboard social contract</p>
      <h1 className="mt-2 text-4xl font-black">Community Covenant</h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        Switchboard exists to help people make and deepen real human connection.
        Everyone using it is expected to protect that intention.
      </p>
      <div className="mt-8 rounded-card border border-line bg-card p-5">
        <ul className="space-y-3 leading-relaxed text-ink-soft">
          {COMMUNITY_COVENANT_SUMMARY.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden className="font-bold text-terracotta-deep">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <section className="mt-8 space-y-3 leading-relaxed text-ink-soft">
        <h2 className="text-xl font-extrabold text-ink">Matching Contexts Matter</h2>
        <p>
          If you choose someone in a discovery category, you are saying you are
          genuinely open to the context shown. A match around hiking means you
          are showing up around hiking. A match around volunteering means you are
          showing up around volunteering. Do not use one context as cover for a
          different agenda.
        </p>
        <p>
          Curiosity is welcome. Pressure, deception, entitlement, harassment,
          and boundary-pushing are not.
        </p>
      </section>
      <section className="mt-8 space-y-3 leading-relaxed text-ink-soft">
        <h2 className="text-xl font-extrabold text-ink">Meet Up With Care</h2>
        <p>
          Choose an appropriate public or trusted place, share your plans with
          someone you trust, and leave whenever something feels wrong. For
          kid-inclusive plans, a parent or guardian stays responsible and
          present. Never post a child&apos;s name, age, school, contact details, or
          live location.
        </p>
      </section>
      <div className="mt-10 flex flex-wrap gap-4 text-sm font-bold text-terracotta-deep">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/copyright">Copyright</Link>
        <Link href="/welcome">Back to Switchboard</Link>
      </div>
    </main>
  );
}
