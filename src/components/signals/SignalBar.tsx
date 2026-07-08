'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { addSignal, clearSignal, removeSignal, setSignalsAudience } from '@/lib/actions/signals';
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
  active: ActiveSignal[];
  circles: CircleOption[];
}

/** One-tap availability from the home screen. Toggle as many signals on as you like. */
export function SignalBar({ active, circles }: SignalBarProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const activeByLabel = new Map(active.map((s) => [s.label, s]));
  const anyActive = active.length > 0;

  // Every live signal shares one audience; fall back to "everyone" when nothing is on.
  const audience = anyActive ? active[0].circle_id : null;

  // Soonest expiry drives the shared "ends" hint.
  const nextExpiry = anyActive
    ? active.reduce((soonest, s) => (s.expires_at < soonest ? s.expires_at : soonest), active[0].expires_at)
    : null;

  function toggle(preset: { emoji: string; label: string }) {
    startTransition(async () => {
      if (activeByLabel.has(preset.label)) {
        await removeSignal(preset.label);
      } else {
        await addSignal(preset.emoji, preset.label, audience);
      }
      router.refresh();
    });
  }

  function chooseAudience(circleId: string | null) {
    startTransition(async () => {
      await setSignalsAudience(circleId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SIGNAL_PRESETS.map((signal) => (
          <Chip
            key={signal.label}
            emoji={signal.emoji}
            selected={activeByLabel.has(signal.label)}
            disabled={pending}
            onClick={() => toggle(signal)}
            className="w-full justify-center whitespace-nowrap"
          >
            {signal.label}
          </Chip>
        ))}
      </div>

      {anyActive ? (
        <Card tone="sage" className="animate-rise">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium text-sage-deep">Who can see these?</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                selected={audience === null}
                disabled={pending}
                onClick={() => chooseAudience(null)}
                className="!px-3 !py-1 text-xs"
              >
                Everyone I know
              </Chip>
              {circles.map((circle) => (
                <Chip
                  key={circle.id}
                  emoji={circle.emoji}
                  selected={audience === circle.id}
                  disabled={pending}
                  onClick={() => chooseAudience(circle.id)}
                  className="!px-3 !py-1 text-xs"
                >
                  {circle.name}
                </Chip>
              ))}
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-faint">
              No broadcast, no notification - friends simply notice when they open
              Switchboard.{nextExpiry ? ` Turns off ${formatRelative(nextExpiry)}.` : ''}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await clearSignal();
                  router.refresh();
                })
              }
              className="shrink-0 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink-faint hover:text-ink"
            >
              Turn all off
            </button>
          </div>
        </Card>
      ) : (
        <p className="text-xs text-ink-faint">
          Tap any that fit - friends quietly notice when they open Switchboard. Each
          turns off by itself in 3 hours.
        </p>
      )}
    </div>
  );
}
