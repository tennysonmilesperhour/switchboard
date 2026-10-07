'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * The pieces a walkthrough scene is built from.
 *
 * A scene is a staged screen that plays itself: one clock starts when the scene
 * mounts, and every element decides from that clock whether it has appeared yet,
 * how much of its text is typed, or whether a finger is on it. Nothing loops
 * and nothing waits on the reader; by the time they have read the caption the
 * screen has finished, and Next is always live.
 *
 * Reduced motion skips straight to the finished screen. The stage is
 * decorative (the caption carries the meaning), so it is hidden from screen
 * readers by the player.
 */

const ClockContext = createContext(0);

/** Long enough for the slowest scene to finish; the clock stops here. */
const SCENE_LENGTH_MS = 7000;
/** Re-render in steps rather than every frame; nothing here needs 60fps. */
const TICK_MS = 40;

export function SceneClock({ children }: { children: ReactNode }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let frame = 0;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    const tick = (now: number) => {
      const ms = reduce ? SCENE_LENGTH_MS : Math.min(now - started, SCENE_LENGTH_MS);
      setElapsed(Math.floor(ms / TICK_MS) * TICK_MS);
      if (ms < SCENE_LENGTH_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <ClockContext.Provider value={elapsed}>{children}</ClockContext.Provider>;
}

/** Milliseconds since the scene started. */
export function useElapsed(): number {
  return useContext(ClockContext);
}

/** True once the scene has reached `ms`. */
export function useAt(ms: number): boolean {
  return useElapsed() >= ms;
}

/**
 * Children appear at `ms` with a short rise. `keep` reserves their space before
 * then, for elements that should not push the layout around when they land.
 */
export function At({
  ms,
  keep = false,
  className = '',
  children,
}: {
  ms: number;
  keep?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const shown = useAt(ms);
  if (!shown) {
    return keep ? (
      <div className={`invisible ${className}`}>{children}</div>
    ) : null;
  }
  return <div className={`animate-rise ${className}`}>{children}</div>;
}

/** Text that types itself from `from`, with a caret while it is typing. */
export function Typed({
  text,
  from = 0,
  cps = 26,
  className = '',
  placeholder,
}: {
  text: string;
  from?: number;
  /** Characters per second. */
  cps?: number;
  className?: string;
  /** Shown, faint, before typing starts. */
  placeholder?: string;
}) {
  const elapsed = useElapsed();
  const count = Math.max(0, Math.min(text.length, Math.floor(((elapsed - from) / 1000) * cps)));
  const typing = elapsed >= from && count < text.length;
  if (count === 0 && placeholder && !typing) {
    return <span className={`text-ink-faint ${className}`}>{placeholder}</span>;
  }
  return (
    <span className={className}>
      {text.slice(0, count)}
      {typing && (
        <span className="ml-px inline-block h-[1em] w-[2px] translate-y-[2px] bg-terracotta align-baseline" />
      )}
    </span>
  );
}

/**
 * A finger on the element at `at`: a ring pulses over it and the element dips,
 * the way a real tap looks. The ring is gone again after a moment.
 */
export function Tap({
  at,
  className = '',
  children,
}: {
  at: number;
  className?: string;
  children: ReactNode;
}) {
  const elapsed = useElapsed();
  const pressing = elapsed >= at && elapsed < at + 650;
  return (
    <div
      className={`relative transition-transform duration-150 ${pressing ? 'scale-[0.96]' : ''} ${className}`}
    >
      {children}
      {pressing && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute inset-0 animate-ping rounded-full bg-terracotta/40" />
          <span className="absolute inset-2 rounded-full bg-terracotta/50" />
        </span>
      )}
    </div>
  );
}

/** A number that counts up to `to` between `from` and `from + over`. */
export function CountUp({
  to,
  from = 0,
  over = 900,
}: {
  to: number;
  from?: number;
  over?: number;
}) {
  const elapsed = useElapsed();
  const progress = Math.max(0, Math.min(1, (elapsed - from) / over));
  return <>{Math.round(to * progress)}</>;
}

/** 0 → 1 between `from` and `from + over`, for widths and fills. */
export function useProgress(from: number, over = 900): number {
  const elapsed = useElapsed();
  return Math.max(0, Math.min(1, (elapsed - from) / over));
}

/** The phone the scene plays on. */
export function Phone({
  title,
  children,
}: {
  /** The screen's own header, as the app would show it. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative mx-auto flex h-[min(44svh,440px)] min-h-[270px] [@media(min-height:740px)]:h-[min(54svh,440px)] w-[min(100%,272px)] flex-col overflow-hidden rounded-[2.25rem] border-[6px] border-ink bg-paper shadow-float">
      <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-2 text-[10px] font-bold text-ink">
        <span>9:41</span>
        <span className="h-4 w-16 rounded-full bg-ink" />
        <span className="flex items-center gap-0.5">
          <span className="h-2 w-3 rounded-[2px] border border-ink" />
        </span>
      </div>
      {title ? (
        <p className="shrink-0 px-4 pb-2 pt-1 text-lg font-extrabold tracking-tight text-ink">
          {title}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden px-3 pb-3">{children}</div>
    </div>
  );
}

/** A small rounded card inside a scene. */
export function Panel({
  className = '',
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-2.5 shadow-lift ${className}`}>
      {children}
    </div>
  );
}

/** Initials in a colored circle, for the made-up people in scenes. */
export function Face({
  name,
  hue,
  size = 'md',
}: {
  name: string;
  hue: number;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${
        size === 'sm' ? 'size-5 text-[8px]' : 'size-7 text-[10px]'
      }`}
      style={{ backgroundColor: `hsl(${hue} 62% 52%)` }}
    >
      {name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)}
    </span>
  );
}

/** A status pill: grey while waiting, colored once it lands. */
export function Pill({
  tone,
  children,
}: {
  tone: 'wait' | 'live' | 'yes' | 'no' | 'gold';
  children: ReactNode;
}) {
  const tones = {
    wait: 'bg-cream text-ink-faint',
    live: 'bg-terracotta-soft text-terracotta-deep',
    yes: 'bg-sage-soft text-sage-deep',
    no: 'bg-rose-soft text-rose-deep',
    gold: 'bg-gold-soft text-gold-deep',
  } as const;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
