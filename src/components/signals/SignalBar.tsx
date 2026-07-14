'use client';

import { useOptimistic, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
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

/** What the bar shows: which signals are lit and the audience they share. */
interface SignalView {
  labels: string[];
  audience: string | null;
}

type ViewAction =
  | { type: 'toggle'; label: string }
  | { type: 'audience'; audience: string | null }
  | { type: 'clear' };

/** One-tap availability from the home screen. Toggle as many signals on as you like. */
export function SignalBar({ active, circles }: SignalBarProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  // Every live signal shares one audience; fall back to "everyone" when nothing is on.
  const serverView: SignalView = {
    labels: active.map((s) => s.label),
    audience: active.length > 0 ? active[0].circle_id : null,
  };

  // Reflect taps immediately, then reconcile with the server on refresh. This keeps
  // the bar responsive without waiting on a full home-page re-render, so no tap ever
  // leaves the controls stuck disabled.
  const [view, applyView] = useOptimistic<SignalView, ViewAction>(
    serverView,
    (state, action) => {
      switch (action.type) {
        case 'toggle':
          return {
            ...state,
            labels: state.labels.includes(action.label)
              ? state.labels.filter((label) => label !== action.label)
              : [...state.labels, action.label],
          };
        case 'audience':
          return { ...state, audience: action.audience };
        case 'clear':
          return { labels: [], audience: null };
      }
    },
  );

  const activeLabels = new Set(view.labels);
  const anyActive = view.labels.length > 0;
  const audience = view.audience;

  // Soonest expiry drives the shared "ends" hint.
  const nextExpiry =
    active.length > 0
      ? active.reduce(
          (soonest, s) => (s.expires_at < soonest ? s.expires_at : soonest),
          active[0].expires_at,
        )
      : null;

  function toggle(preset: { emoji: string; label: string }) {
    const wasActive = activeLabels.has(preset.label);
    startTransition(async () => {
      applyView({ type: 'toggle', label: preset.label });
      const result = wasActive
        ? await removeSignal(preset.label)
        : await addSignal(preset.emoji, preset.label, audience);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update your signal.');
        return;
      }
      router.refresh();
    });
  }

  function chooseAudience(circleId: string | null) {
    startTransition(async () => {
      applyView({ type: 'audience', audience: circleId });
      const result = await setSignalsAudience(circleId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change who can see this.');
        return;
      }
      router.refresh();
    });
  }

  function turnAllOff() {
    startTransition(async () => {
      applyView({ type: 'clear' });
      const result = await clearSignal();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not turn your signals off.');
        return;
      }
      router.refresh();
      toast.success('Signals turned off.');
    });
  }

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SIGNAL_PRESETS.map((signal) => (
          <Chip
            key={signal.label}
            emoji={signal.emoji}
            selected={activeLabels.has(signal.label)}
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
              onClick={turnAllOff}
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
