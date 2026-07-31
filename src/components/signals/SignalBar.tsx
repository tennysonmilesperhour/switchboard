'use client';

import { useOptimistic, useTransition } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { MultiSelectChips } from '@/components/ui/MultiSelectChips';
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
  circle_ids: string[];
}

interface SignalBarProps {
  active: ActiveSignal[];
  circles: CircleOption[];
}

/** What the bar shows: which signals are lit and the audience they share. */
interface SignalView {
  labels: string[];
  audiences: string[];
}

type ViewAction =
  | { type: 'set'; label: string; on: boolean }
  | { type: 'audience'; audiences: string[] }
  | { type: 'clear' };

/** One-tap availability from the home screen. Toggle as many signals on as you like. */
export function SignalBar({ active, circles }: SignalBarProps) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Every live signal shares one audience; fall back to "everyone" when nothing is on.
  const serverView: SignalView = {
    labels: active.map((s) => s.label),
    audiences: active.length > 0 ? active[0].circle_ids : [],
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
          return { ...state, audiences: action.audiences };
        case 'clear':
          return { labels: [], audiences: [] };
      }
    },
  );

  const activeLabels = new Set(view.labels);
  const anyActive = view.labels.length > 0;
  const audiences = view.audiences;

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
        ? await addSignal(preset.emoji, preset.label, audiences)
        : await removeSignal(preset.label);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update your signal.', result.code);
      }
    });
  }

  function chooseAudiences(circleIds: string[]) {
    startTransition(async () => {
      applyView({ type: 'audience', audiences: circleIds });
      const result = await setSignalsAudience(circleIds);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change who can see this.', result.code);
      }
    });
  }

  function turnAllOff() {
    startTransition(async () => {
      applyView({ type: 'clear' });
      const result = await clearSignal();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not turn your signals off.', result.code);
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
            <p className="text-sm font-medium text-sage-deep">
              Who can see these?{' '}
              <span className="font-normal text-ink-faint">Pick as many as you like.</span>
            </p>
            <MultiSelectChips
              ariaLabel="Who can see your signals"
              options={circles.map((circle) => ({
                value: circle.id,
                label: circle.name,
                emoji: circle.emoji,
              }))}
              selected={audiences}
              onChange={chooseAudiences}
              allOption={{ label: 'Everyone I know' }}
              chipClassName="!px-3 !py-1 text-xs"
            />
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
