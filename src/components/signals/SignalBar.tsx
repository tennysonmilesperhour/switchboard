'use client';

import { useOptimistic, useTransition } from 'react';
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
  | { type: 'set'; label: string; on: boolean }
  | { type: 'audience'; audience: string | null }
  | { type: 'clear' };

/** One-tap availability from the home screen. Toggle as many signals on as you like. */
export function SignalBar({ active, circles }: SignalBarProps) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Every live signal shares one audience; fall back to "everyone" when nothing is on.
  const serverView: SignalView = {
    labels: active.map((s) => s.label),
    audience: active.length > 0 ? active[0].circle_id : null,
  };

  // Reflect taps immediately, then reconcile when each server action's
  // revalidatePath('/') re-renders this component with fresh props. We intentionally
  // do NOT call router.refresh() in the handlers: it fires a second full home-page
  // refetch and, worse, updates `active` mid-transition so the optimistic overlay
  // briefly re-applies against an already-updated base — the tap lights up, flips
  // back for the length of the refetch, then settles, which reads as a ~1s lag.
  // The optimistic actions are absolute (set on/off, pick an audience) rather than
  // relative toggles, so they stay correct even if the base changes underneath them.
  const [view, applyView] = useOptimistic<SignalView, ViewAction>(
    serverView,
    (state, action) => {
      switch (action.type) {
        case 'set':
          return {
            ...state,
            labels: action.on
              ? state.labels.includes(action.label)
                ? state.labels
                : [...state.labels, action.label]
              : state.labels.filter((label) => label !== action.label),
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
    const turnOn = !activeLabels.has(preset.label);
    startTransition(async () => {
      applyView({ type: 'set', label: preset.label, on: turnOn });
      const result = turnOn
        ? await addSignal(preset.emoji, preset.label, audience)
        : await removeSignal(preset.label);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update your signal.');
      }
    });
  }

  function chooseAudience(circleId: string | null) {
    startTransition(async () => {
      applyView({ type: 'audience', audience: circleId });
      const result = await setSignalsAudience(circleId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change who can see this.');
      }
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
