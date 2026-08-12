'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';

const INTENTS = [
  {
    emoji: '🗓️',
    title: "I've got a plan",
    subtitle: 'Create an event and start inviting',
    href: '/events/new',
  },
  {
    emoji: '💡',
    title: 'Help me figure it out',
    subtitle: 'Describe a vibe — get curated ideas',
    anchor: 'brainstorm',
  },
  {
    emoji: '🔍',
    title: 'Find something to do',
    subtitle: 'Browse open tables and meet people',
    anchor: 'browse',
  },
] as const;

export function IntentLaunchpad() {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold">What's the move?</h2>
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
                  <span className="text-sm font-bold text-terracotta whitespace-nowrap">→</span>
                </div>
              </Card>
            </Link>
          ) : (
            <button
              key={intent.title}
              className="group block w-full text-left"
              onClick={() => {
                const el = document.getElementById(intent.anchor!);
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
                  <span className="text-sm font-bold text-terracotta whitespace-nowrap">↓</span>
                </div>
              </Card>
            </button>
          ),
        )}
      </div>
    </section>
  );
}
