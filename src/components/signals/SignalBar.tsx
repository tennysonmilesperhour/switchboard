'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { clearSignal, setSignal } from '@/lib/actions/signals';
import { formatRelative } from '@/lib/format';
import { SIGNAL_PRESETS } from '@/lib/types';

interface CircleOption {
  id: string;
  name: string;
  emoji: string;
}

interface ActiveSignal {
  emoji: string;
  label: string;
  expires_at: string;
  circle_id: string | null;
}

interface SignalBarProps {
  active: ActiveSignal | null;
  circles: CircleOption[];
}

/** One-tap availability from the home screen. */
export function SignalBar({ active, circles }: SignalBarProps) {
  const [choosing, setChoosing] = useState<{ emoji: string; label: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function activate(circleId: string | null) {
    const chosen = choosing;
    if (!chosen) return;
    setChoosing(null);
    startTransition(async () => {
      await setSignal(chosen.emoji, chosen.label, circleId);
      router.refresh();
    });
  }

  if (active) {
    return (
      <Card tone="sage" className="animate-rise">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>{active.emoji}</span>
          <div className="flex-1">
            <p className="font-bold text-sage-deep">{active.label}</p>
            <p className="text-xs text-ink-soft">
              Visible to{' '}
              {active.circle_id
                ? circles.find((c) => c.id === active.circle_id)?.name ?? 'a circle'
                : 'all your connections'}{' '}
              · ends {formatRelative(active.expires_at)}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await clearSignal();
                router.refresh();
              })
            }
            className="text-xs font-medium text-ink-faint hover:text-ink rounded-pill border border-line px-3 py-1.5 bg-card"
          >
            Turn off
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 [scrollbar-width:none]">
        {SIGNAL_PRESETS.map((signal) => (
          <Chip
            key={signal.label}
            emoji={signal.emoji}
            selected={choosing?.label === signal.label}
            onClick={() =>
              setChoosing(
                choosing?.label === signal.label
                  ? null
                  : { emoji: signal.emoji, label: signal.label },
              )
            }
            className="whitespace-nowrap shrink-0"
          >
            {signal.label}
          </Chip>
        ))}
      </div>
      {choosing && (
        <Card className="mt-2 animate-rise">
          <p className="text-sm font-medium mb-2">
            Who can see “{choosing.emoji} {choosing.label}”?
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip onClick={() => activate(null)} disabled={pending}>
              Everyone I know
            </Chip>
            {circles.map((circle) => (
              <Chip
                key={circle.id}
                emoji={circle.emoji}
                onClick={() => activate(circle.id)}
                disabled={pending}
              >
                {circle.name}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-ink-faint mt-2.5">
            No broadcast, no notification - friends simply notice when they
            open Switchboard. It turns off by itself in 3 hours.
          </p>
        </Card>
      )}
    </div>
  );
}
