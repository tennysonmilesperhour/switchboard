'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';

/**
 * Three different things this page can do, named for what each one is.
 *
 * These used to reuse the labels from the "Start something" doors ("Help me
 * figure it out", "Find something to do") for destinations that were not the
 * same: on `/create` the second door opens the group poll and the third lands
 * here, while here they scrolled to the idea generator and to people
 * discovery. Someone who tapped "Find something to do" arrived on a page
 * offering "Find something to do" again, meaning something else.
 */
const INTENTS = [
  {
    emoji: '🪜',
    title: 'Start a plan',
    subtitle: 'You know the gist. Set it up and send the invites.',
    href: '/events/new',
  },
  {
    emoji: '💡',
    title: 'Get ideas',
    subtitle: 'Describe the evening you want and get a few that fit',
    anchor: 'brainstorm',
  },
  {
    emoji: '👋',
    title: 'Meet people and open tables',
    subtitle: 'Who is discoverable, and plans with a seat still open',
    anchor: 'browse',
  },
] as const;

export function IntentLaunchpad() {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold">What&apos;s the move?</h2>
      <div className="grid gap-2">
        {INTENTS.map((intent) =>
          'href' in intent && intent.href ? (
            <Link key={intent.title} href={intent.href} className="group block">
              <Card className="group-hover:border-terracotta transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xl" aria-hidden>
                    {intent.emoji}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-bold">{intent.title}</span>
                    <span className="block text-xs text-ink-faint">{intent.subtitle}</span>
                  </span>
                  <span className="text-sm font-bold text-terracotta-deep whitespace-nowrap">→</span>
                </div>
              </Card>
            </Link>
          ) : (
            <button
              key={intent.title}
              className="group block w-full text-left"
              onClick={() => {
                const anchor = 'anchor' in intent ? intent.anchor : null;
                const el = anchor ? document.getElementById(anchor) : null;
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <Card className="group-hover:border-terracotta transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xl" aria-hidden>
                    {intent.emoji}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-bold">{intent.title}</span>
                    <span className="block text-xs text-ink-faint">{intent.subtitle}</span>
                  </span>
                  <span className="text-sm font-bold text-terracotta-deep whitespace-nowrap">↓</span>
                </div>
              </Card>
            </button>
          ),
        )}
      </div>
    </section>
  );
}
