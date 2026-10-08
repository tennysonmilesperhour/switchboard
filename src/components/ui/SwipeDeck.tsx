'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

export type SwipeDirection = 'left' | 'right';

/** Drag distance, in px, past which a release counts as a decision. */
export const SWIPE_THRESHOLD = 96;

/** Whether a drag of `dx` px decides the card, and which way. */
export function swipeDecision(dx: number): SwipeDirection | null {
  if (dx >= SWIPE_THRESHOLD) return 'right';
  if (dx <= -SWIPE_THRESHOLD) return 'left';
  return null;
}

/** Controls inside a card (selects, links, buttons) must not start a drag. */
const INTERACTIVE = 'button, a, select, input, textarea, label, [data-no-swipe]';

/**
 * A stack of cards decided one at a time, by dragging or by the two buttons
 * under it. The buttons are the real controls: the drag is a shortcut for
 * them, so keyboard and assistive-tech users get the same two choices.
 *
 * `onDecide` resolves true when the decision took (the card leaves) and false
 * when it failed (the card springs back and stays), so a failed save is never
 * shown as done.
 */
export function SwipeDeck<T>({
  items,
  getKey,
  renderCard,
  onDecide,
  leftLabel,
  rightLabel,
  empty,
  ariaLabel,
}: {
  items: T[];
  getKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onDecide: (item: T, direction: SwipeDirection) => Promise<boolean>;
  leftLabel: string;
  rightLabel: string;
  empty: ReactNode;
  ariaLabel: string;
}) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; id: number } | null>(null);

  const remaining = items.filter((item) => !gone.has(getKey(item)));
  const top = remaining[0];
  const next = remaining[1];

  async function decide(direction: SwipeDirection) {
    if (!top || busy) return;
    setBusy(true);
    setLeaving(direction);
    setDrag(direction === 'right' ? 480 : -480);
    const ok = await onDecide(top, direction).catch(() => false);
    if (ok) {
      setGone((current) => new Set(current).add(getKey(top)));
    }
    setLeaving(null);
    setDrag(0);
    setBusy(false);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (busy || (event.target as HTMLElement).closest(INTERACTIVE)) return;
    start.current = { x: event.clientX, id: event.pointerId };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== event.pointerId) return;
    setDrag(event.clientX - start.current.x);
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== event.pointerId) return;
    const dx = event.clientX - start.current.x;
    start.current = null;
    setDragging(false);
    const direction = swipeDecision(dx);
    if (direction) void decide(direction);
    else setDrag(0);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight') void decide('right');
    if (event.key === 'ArrowLeft') void decide('left');
  }

  if (!top) return <>{empty}</>;

  const tilt = Math.max(-12, Math.min(12, drag / 18));
  const intent = swipeDecision(drag) ?? (Math.abs(drag) > 24 ? (drag > 0 ? 'right' : 'left') : null);

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-roledescription="card stack"
        aria-label={ariaLabel}
        className="relative"
      >
        {next && (
          <div
            aria-hidden
            inert
            className="pointer-events-none absolute inset-x-3 top-3 bottom-0 scale-[0.97] opacity-60"
          >
            {renderCard(next)}
          </div>
        )}
        <div
          key={getKey(top)}
          tabIndex={0}
          aria-label={`Card ${items.length - remaining.length + 1} of ${items.length}. Arrow keys decide: left to ${leftLabel.toLowerCase()}, right to ${rightLabel.toLowerCase()}.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
          style={{
            transform: `translateX(${drag}px) rotate(${tilt}deg)`,
            transition: dragging ? 'none' : 'transform 220ms ease-out, opacity 220ms ease-out',
            opacity: leaving ? 0 : 1,
            touchAction: 'pan-y',
          }}
          className="relative cursor-grab select-none outline-none focus-visible:ring-2 focus-visible:ring-terracotta rounded-card active:cursor-grabbing"
        >
          {renderCard(top)}
          {intent && (
            <span
              aria-hidden
              className={`pointer-events-none absolute top-4 rounded-pill border-2 px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${
                intent === 'right'
                  ? 'left-4 border-sage-deep text-sage-deep'
                  : 'right-4 border-ink-faint text-ink-faint'
              }`}
            >
              {intent === 'right' ? rightLabel : leftLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={() => void decide('left')}
        >
          {leftLabel}
        </Button>
        <Button type="button" className="flex-1" disabled={busy} onClick={() => void decide('right')}>
          {rightLabel}
        </Button>
      </div>
      <p className="text-center text-xs text-ink-faint" aria-live="polite">
        {remaining.length} {remaining.length === 1 ? 'card' : 'cards'} left
      </p>
    </div>
  );
}
