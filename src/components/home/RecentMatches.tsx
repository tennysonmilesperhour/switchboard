'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { dismissMatch, restoreMatch } from '@/lib/actions/matches';
import { formatRelative } from '@/lib/format';

export interface RecentMatch {
  id: string;
  activity: string;
  room_id: string | null;
  created_at: string;
}

/** Past this much horizontal travel, letting go clears the card. */
const COMMIT_PX = 96;
/** Below this, a drag is a tap or the start of a scroll, not a swipe. */
const SLOP_PX = 10;

/**
 * "Recent matches", with a way to clear one.
 *
 * The list used to be append-only: every mutual match stayed on Home forever,
 * so the section became a pile of things already dealt with. Asked for as
 * "swipe these off the screen, or a check box or something".
 *
 * Both were built, because they are not the same affordance. The swipe is the
 * phone gesture people already expect; the button is the one that works with a
 * keyboard, a screen reader, a mouse, and shaky hands. Neither is hidden behind
 * the other — the button is always on screen rather than revealed by swiping,
 * so nobody has to discover a gesture to reach the function.
 *
 * Clearing is private and reversible: it writes one row keyed to this person,
 * the shared match is untouched, the other person's Home doesn't change, and
 * `/mutual` still lists everything. That's what earns a single tap with no
 * confirmation dialog — plus an Undo that stays put instead of a toast that
 * times out.
 */
export function RecentMatches({ matches }: { matches: RecentMatch[] }) {
  // Cleared locally the instant the action fires, so the card leaves under the
  // finger. The server revalidates Home behind it; this state only has to cover
  // the round trip, and is rolled back if the write fails.
  const [cleared, setCleared] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const toast = useToast();

  function clear(match: RecentMatch) {
    setCleared((current) => ({ ...current, [match.id]: match.activity }));
    startTransition(async () => {
      const result = await dismissMatch(match.id);
      if (!result.ok) {
        // Put it back rather than leaving a card that looks cleared but isn't:
        // the next reload would resurrect it anyway, and a card that returns by
        // itself reads as a bug.
        setCleared((current) => {
          const next = { ...current };
          delete next[match.id];
          return next;
        });
        toast.error(result.error ?? 'That didn’t clear.', result.code);
      }
    });
  }

  function undo(id: string) {
    const activity = cleared[id];
    setCleared((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    startTransition(async () => {
      const result = await restoreMatch(id);
      if (!result.ok) {
        setCleared((current) => ({ ...current, [id]: activity }));
        toast.error(result.error ?? 'That didn’t come back.', result.code);
      }
    });
  }

  const visible = matches.filter((m) => !(m.id in cleared));
  // From `cleared`, deliberately, not from `matches`: the server drops a
  // dismissed match from Home's query, so a row derived from `matches` would
  // vanish the moment revalidation landed — taking the Undo with it a beat
  // after the person tapped, which is exactly when they'd reach for it.
  const undoable = Object.entries(cleared).map(([id, activity]) => ({ id, activity }));

  // The heading goes when the last card does — a section header over nothing
  // is the kind of debris that made this list feel stale in the first place.
  if (visible.length === 0 && undoable.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Recent matches ✨" />
      <div className="space-y-2">
        {visible.map((match) => (
          <SwipeableMatch key={match.id} match={match} onClear={() => clear(match)} />
        ))}
        {undoable.map((match) => (
          <Card key={match.id} tone="cream" className="animate-rise">
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm text-ink-soft">
                Cleared <strong className="font-medium">{match.activity}</strong>.
              </p>
              <button
                type="button"
                onClick={() => undo(match.id)}
                className="shrink-0 text-sm font-semibold text-terracotta underline underline-offset-2 hover:text-terracotta-deep"
              >
                Undo
              </button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * One match card: a link, draggable sideways to clear.
 *
 * `touch-action: pan-y` is what keeps the page scrollable — the browser keeps
 * vertical panning for itself and only sends us the horizontal movement, so
 * dragging down the page never snags on a card.
 */
function SwipeableMatch({
  match,
  onClear,
}: {
  match: RecentMatch;
  onClear: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState(false);
  // Whether a swipe is in progress is state, not a ref, because rendering
  // depends on it: the card must follow the finger exactly while held, then
  // animate back or away once released.
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  // Set once a drag passes the slop threshold, and read by the click handler to
  // swallow the click the browser fires at the end of a drag. Without it, a
  // swipe that doesn't reach the threshold navigates into the match room.
  const dragged = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    // Cleared for every press, including the mouse one that returns below: a
    // touch swipe that stopped short of committing leaves this set, and on a
    // touchscreen laptop the next mouse click would then be swallowed by the
    // suppressor and the card would simply refuse to open.
    dragged.current = false;
    // Mouse users get the button, not a drag: pressing and moving with a mouse
    // is how you select text, and hijacking it breaks that.
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!dragged.current) {
      // Not a horizontal swipe until it is more sideways than vertical. A
      // diagonal thumb-flick down the page should scroll, not clear a match.
      if (Math.abs(dx) < SLOP_PX || Math.abs(dx) <= Math.abs(dy)) return;
      dragged.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setOffset(dx);
  }

  function onPointerUp() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(offset) >= COMMIT_PX) {
      // Finish the journey in the direction it was already going, then clear.
      setLeaving(true);
      setOffset(offset > 0 ? 400 : -400);
      onClear();
      return;
    }
    setOffset(0);
  }

  const progress = Math.min(1, Math.abs(offset) / COMMIT_PX);

  return (
    <div className="relative">
      {/* What the card slides off to reveal. aria-hidden: the button below is
          the accessible name for this action, and announcing both would offer
          the same thing twice. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-between rounded-card bg-cream px-4 text-ink-faint"
        style={{ opacity: progress }}
      >
        <Icon name="check" size={18} />
        <Icon name="check" size={18} />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          opacity: leaving ? 0 : 1 - progress * 0.35,
          transition: dragging ? undefined : 'transform 180ms ease, opacity 180ms ease',
          touchAction: 'pan-y',
        }}
        className="relative"
      >
        <Card className="transition-colors group-hover:border-terracotta">
          <div className="flex items-center gap-2">
            <Link
              href={match.room_id ? `/rooms/${match.room_id}` : '/mutual'}
              onClick={(e) => {
                if (dragged.current) e.preventDefault();
              }}
              className="min-w-0 flex-1"
            >
              <p className="text-sm">
                <strong>{match.activity}</strong> - it’s mutual!{' '}
                <span className="text-ink-faint">{formatRelative(match.created_at)}</span>
              </p>
            </Link>
            <button
              type="button"
              onClick={onClear}
              aria-label={`Clear ${match.activity} off your home screen`}
              className="-mr-1 shrink-0 rounded-pill p-2 text-ink-faint transition-colors hover:bg-cream hover:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
