import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Avatar, AvatarCluster } from '@/components/ui/Avatar';
import { PlanCard, PLAN_COLORS } from '@/components/ui/PlanCard';

export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false },
};

const PEOPLE = [
  { name: 'Mike Landry' },
  { name: 'Laura Reed' },
  { name: 'Tyrese Adeyemi' },
  { name: 'Nia Foster' },
  { name: 'Anika Patel' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-ink-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  // Internal design-system reference. Reachable in local dev and preview
  // deployments, but not on the production site (where it's only noindex'd).
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <div className="mx-auto max-w-lg min-h-dvh px-5 py-10">
      <header className="mb-10">
        <span className="text-xl font-extrabold lowercase tracking-tight text-terracotta">
          switchboard
        </span>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-ink">
          Design system
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The living reference for the Switchboard visual language: Work Sans,
          pink accent, and the signature color-coded plan cards.
        </p>
      </header>

      <Section title="Brand">
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Accent', 'bg-terracotta', 'text-white'],
            ['Ink', 'bg-ink', 'text-white'],
            ['Paper', 'bg-paper border border-line', 'text-ink'],
            ['Jade', 'bg-sage', 'text-white'],
            ['Gold', 'bg-gold', 'text-ink'],
            ['Gradient', 'bg-brand-gradient', 'text-white'],
          ].map(([label, bg, fg]) => (
            <div
              key={label}
              className={`flex h-20 items-end rounded-card p-3 ${bg} ${fg}`}
            >
              <span className="text-xs font-bold">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Create account</Button>
          <Button variant="secondary">Sign in</Button>
          <Button variant="accept">Accept</Button>
          <Button variant="danger">Decline</Button>
          <Button variant="ghost">Skip</Button>
        </div>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-2">
          <Chip selected>Nightlife</Chip>
          <Chip>Food</Chip>
          <Chip>Hiking</Chip>
          <Chip selected>Concerts</Chip>
          <Chip>Thrifting</Chip>
        </div>
      </Section>

      <Section title="Avatars">
        <div className="flex items-center gap-6">
          <Avatar name="Mike Landry" size="lg" />
          <AvatarCluster people={PEOPLE} size="md" />
        </div>
      </Section>

      <Section title="Plan card">
        <PlanCard
          title="grab a coffee"
          color="pink"
          attendees={PEOPLE}
          attendeesLabel="Mike and 3 others"
          when="Tuesday at 2:00 pm"
          dateLabel="August 7"
          where="Windy Ridge Café"
          distance="0.5 mi"
          actions={
            <>
              <span className="inline-flex items-center gap-1.5 rounded-btn bg-white/25 px-5 py-2.5 text-sm font-bold backdrop-blur-sm">
                Map
              </span>
              <span className="inline-flex items-center rounded-btn bg-white/25 px-5 py-2.5 text-sm font-bold backdrop-blur-sm">
                Change plan
              </span>
            </>
          }
        />
      </Section>

      <Section title="Plan card - compact, all colors">
        <div className="space-y-3">
          {PLAN_COLORS.map((color, i) => (
            <PlanCard
              key={color}
              variant="compact"
              color={color}
              title={['group hike', 'silent disco', 'late night tacos', 'board games', 'rooftop yoga', 'salsa dancing'][i]}
              when="Tuesday at 2:00 pm"
              where="Windy Ridge Café"
              dateLabel="August 7"
              attendees={PEOPLE.slice(0, 3)}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
