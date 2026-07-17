'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { setOperatorSetting } from '@/lib/actions/identity';

interface OperatorToggle {
  key: string;
  label: string;
  desc: string;
  /** 'read' unlocks an optional facet; 'behavior' lets the app act for you. */
  kind: 'read' | 'behavior';
  /** Not yet wired into any flow — shown but disabled so it can't overclaim. */
  soon?: boolean;
}

const TOGGLES: OperatorToggle[] = [
  {
    key: 'facet_divergence',
    label: 'On paper vs. in practice',
    desc: 'Surface the gaps between how you describe yourself and what you actually do.',
    kind: 'read',
  },
  {
    key: 'facet_compatibility',
    label: 'Compatibility with connections',
    desc: 'Let a connection and you see a shared read of how you fit - only when you both turn it on.',
    kind: 'read',
  },
  {
    key: 'capacity_guard',
    label: 'Capacity nudge',
    desc: 'A gentle heads-up on the review step when you already have several plans in the week ahead. Never blocks anything.',
    kind: 'behavior',
  },
  {
    key: 'tune_windows',
    label: 'Tune my defaults',
    desc: 'Let your tempo set smarter default response windows when you make plans.',
    kind: 'behavior',
  },
];

export function OperatorSettings({ settings }: { settings: Record<string, boolean> }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
        Operator settings
      </h3>
      <p className="mb-3 text-xs leading-relaxed text-ink-faint">
        Seeing a pattern and being acted on by it are different choices. Each of
        these is off until you turn it on, and you can turn it back off anytime.
      </p>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {TOGGLES.map((t, i) => (
          <ToggleRow
            key={t.key}
            toggle={t}
            enabled={Boolean(settings[t.key])}
            first={i === 0}
          />
        ))}
      </div>
    </section>
  );
}

function ToggleRow({
  toggle,
  enabled,
  first,
}: {
  toggle: OperatorToggle;
  enabled: boolean;
  first: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function flip() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await setOperatorSetting(toggle.key, next);
      if (!res.ok) {
        setOn(!next);
        toast.error('Could not update that setting');
      } else {
        router.refresh();
      }
    });
  }

  // Behaviors that aren't wired yet are shown but disabled, so the control can
  // never imply the app is acting when it isn't.
  const disabled = pending || Boolean(toggle.soon);

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 ${first ? '' : 'border-t border-line'}`}>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-bold ${toggle.soon ? 'text-ink-soft' : 'text-ink'}`}>
            {toggle.label}
          </span>
          <span
            className={`rounded-pill px-1.5 py-0.5 text-[10px] font-bold ${
              toggle.kind === 'read' ? 'bg-cream text-ink-faint' : 'bg-gold-soft text-gold-deep'
            }`}
          >
            {toggle.kind === 'read' ? 'Read' : 'Acts for you'}
          </span>
          {toggle.soon ? (
            <span className="rounded-pill bg-cream px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">
              Soon
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">
          {toggle.desc}
          {toggle.soon ? ' Not wired up yet - you can turn it on once it is.' : ''}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={toggle.soon ? false : on}
        aria-label={toggle.label}
        aria-disabled={disabled}
        onClick={flip}
        disabled={disabled}
        className={`mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:opacity-40 ${
          on && !toggle.soon ? 'bg-sage' : 'bg-line'
        }`}
      >
        <span
          className={`size-5 rounded-full bg-card shadow-sm transition-transform ${
            on && !toggle.soon ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
