'use client';

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { MultiSelectChips } from '@/components/ui/MultiSelectChips';
import { useToast } from '@/components/ui/Toast';
import { addSignal, clearSignal, removeSignal, setSignalsAudience } from '@/lib/actions/signals';
import { formatRelative } from '@/lib/format';
import { mostRecentlyChosenCircle, resolveSignalAudience } from '@/lib/signal-audience';
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
  defaultCircleId: string | null;
}

/** What the bar shows: which signals are lit and the audience they share. */
interface SignalView {
  labels: string[];
  audiences: string[];
}

type ViewAction =
  | { type: 'set'; label: string; on: boolean }
  | { type: 'audience'; audiences: string[] }
  | { type: 'clear'; audiences: string[] };

/** One-tap availability from the home screen. Toggle as many signals on as you like. */
export function SignalBar({ active, circles, defaultCircleId }: SignalBarProps) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [customEmoji, setCustomEmoji] = useState('✨');
  const [customLabel, setCustomLabel] = useState('');

  // Every live signal shares one audience. A fresh composer starts at the
  // remembered circle (or the first circle), never Everyone when circles exist.
  const serverView: SignalView = {
    labels: active.map((s) => s.label),
    audiences: resolveSignalAudience(
      active.length > 0 ? active[0].circle_ids : null,
      defaultCircleId,
    ),
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
          return { labels: [], audiences: action.audiences };
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

  const locationPrompted = useRef(false);

  function promptLocationOnce() {
    if (locationPrompted.current) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    if (typeof navigator.permissions === 'undefined') {
      locationPrompted.current = true;
      navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5_000 });
      return;
    }
    locationPrompted.current = true;
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      if (result.state === 'prompt') {
        navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5_000 });
      }
    }).catch(() => {});
  }

  function toggle(preset: { emoji: string; label: string }) {
    const turnOn = !activeLabels.has(preset.label);
    if (turnOn) promptLocationOnce();
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
    const rememberedCircleId = mostRecentlyChosenCircle(audiences, circleIds);
    startTransition(async () => {
      applyView({ type: 'audience', audiences: circleIds });
      const result = await setSignalsAudience(circleIds, rememberedCircleId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not change who can see this.', result.code);
      }
    });
  }

  function turnAllOff() {
    startTransition(async () => {
      applyView({
        type: 'clear',
        audiences: defaultCircleId ? [defaultCircleId] : [],
      });
      const result = await clearSignal();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not turn your signals off.', result.code);
        return;
      }
      toast.success('Signals turned off.');
    });
  }

  function addCustom() {
    const label = customLabel.trim();
    if (!label) return;
    promptLocationOnce();
    startTransition(async () => {
      applyView({ type: 'set', label, on: true });
      const result = await addSignal(customEmoji || '✨', label, audiences);
      if (!result.ok) toast.error(result.error ?? 'Could not add your status.', result.code);
      else setCustomLabel('');
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
      <div className="flex gap-2">
        <input aria-label="Status emoji" value={customEmoji} onChange={(event) => setCustomEmoji(event.target.value)} maxLength={4} className="w-14 rounded-xl border border-line bg-card px-2 py-2 text-center" />
        <input aria-label="Custom status" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }} maxLength={40} placeholder="Add your own status…" className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-terracotta" />
        <button type="button" disabled={pending || !customLabel.trim()} onClick={addCustom} className="rounded-xl bg-ink px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Add</button>
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
