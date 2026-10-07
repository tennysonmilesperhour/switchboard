import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Glyph } from '@/components/ui/Glyph';

export const metadata: Metadata = { title: 'Start something' };

/**
 * The broad, simple layer before the full wizard. Most reaching-out isn't a
 * fully-specified event yet, so we ask what *kind* of thing this is first and
 * route to the right tool — the six-step wizard is only one of the doors.
 */
const DOORS: Array<{
  href: string;
  emoji: string;
  title: string;
  body: string;
}> = [
  {
    href: '/events/new',
    emoji: '🪜',
    title: 'I’ve got a plan',
    body: 'You know the gist - the what, when, or who. Set it up and send the invites.',
  },
  {
    href: '/events/new?decide=1',
    emoji: '🗳️',
    title: 'Help me figure it out',
    body: 'Not sure yet? Set the scene, float a few options, and let the group vote before anything goes out.',
  },
  {
    href: '/discover',
    emoji: '🧭',
    title: 'Find something to do',
    body: 'Browse ideas and spots that fit the vibe, then turn one into a plan.',
  },
];

export default async function CreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <AppShell title="Start something" back="/">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          What are you in the mood to do? No wrong answer - you can change your
          mind at any step.
        </p>
        <div className="space-y-3">
          {DOORS.map((door) => (
            <Link
              key={door.href}
              href={door.href}
              className="block active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-4 rounded-card border-2 border-line bg-card p-4 hover:border-terracotta/50">
                <span
                  className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cream"
                  aria-hidden
                >
                  <Glyph emoji={door.emoji} size={24} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold text-ink">{door.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink-soft">
                    {door.body}
                  </span>
                </span>
                <Icon
                  name="back"
                  size={18}
                  className="shrink-0 rotate-180 text-ink-faint"
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
