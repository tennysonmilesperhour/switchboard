import Link from 'next/link';
import { COMMUNITY_COVENANT_SUMMARY } from '@/lib/legal';

export default function CommunityPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-ink">
      <p className="text-sm font-bold text-terracotta">Switchboard social contract</p>
      <h1 className="mt-2 text-4xl font-black">Community Covenant</h1>
      <p className="mt-4 leading-relaxed text-ink-soft">
        Switchboard exists to help people make and deepen real human connection.
        Everyone using it is expected to protect that intention.
      </p>
      <div className="mt-8 rounded-card border border-line bg-card p-5">
        <ul className="space-y-3 leading-relaxed text-ink-soft">
          {COMMUNITY_COVENANT_SUMMARY.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden className="font-bold text-terracotta">•</span>
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
          present. Never post a child’s name, age, school, contact details, or
          live location.
        </p>
      </section>
      <div className="mt-10 flex flex-wrap gap-4 text-sm font-bold text-terracotta">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/copyright">Copyright</Link>
        <Link href="/welcome">Back to Switchboard</Link>
      </div>
    </main>
  );
}
