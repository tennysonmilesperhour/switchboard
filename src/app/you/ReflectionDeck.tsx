'use client';

import { useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { saveEventReflection } from '@/lib/actions/reflections';
import { formatDate } from '@/lib/format';
import {
  DECK_TAGS,
  JOURNAL_MAX,
  SWIPE_VERDICT,
  VERDICT_LABEL,
  swipeDirection,
  type SwipeDirection,
} from '@/lib/reflection-deck';
import type { DeckCard } from '@/lib/server/reflection-deck';

const EXIT: Record<SwipeDirection, string> = {
  left: 'translate(-140%, 0) rotate(-18deg)',
  right: 'translate(140%, 0) rotate(18deg)',
  up: 'translate(0, -140%)',
  down: 'translate(0, 140%)',
};

const STAMP: Record<SwipeDirection, string> = {
  left: 'border-ink-faint text-ink-faint',
  right: 'border-sage text-sage-deep',
  up: 'border-terracotta text-terracotta-deep',
  down: 'border-gold-deep text-gold-deep',
};

const ACTIONS: { dir: SwipeDirection; icon: IconName; hint: string }[] = [
  { dir: 'left', icon: 'close', hint: 'Swipe left' },
  { dir: 'down', icon: 'eyeOff', hint: 'Swipe down' },
  { dir: 'up', icon: 'sparkle', hint: 'Swipe up' },
  { dir: 'right', icon: 'check', hint: 'Swipe right' },
];

const ROLE_LABEL = { host: 'You hosted', cohost: 'You co-hosted', guest: 'You said yes' } as const;

export function ReflectionDeck({ cards, failed }: { cards: DeckCard[]; failed: boolean }) {
  const toast = useToast();
  const [queue, setQueue] = useState(cards);
  const [swiped, setSwiped] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [journal, setJournal] = useState('');
  const [journalOpen, setJournalOpen] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  const top = queue[0];

  if (failed) {
    return (
      <p className="rounded-card border border-line bg-cream/50 p-4 text-sm text-ink-soft">
        Your look-back deck didn’t load. Reload the page.{' '}
        <span className="text-[11px] text-ink-faint">SB-REFLECT-LOAD</span>
      </p>
    );
  }

  if (!top) {
    return (
      <div className="rounded-card border border-line bg-cream/50 p-5 text-center">
        <p className="text-sm font-bold text-ink">
          {swiped > 0 ? 'All caught up' : 'Nothing to look back on yet'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          {swiped > 0
            ? 'Every finished plan has an answer. New ones show up a day after they end.'
            : 'Plans you hosted or said yes to appear here a day after they end.'}
        </p>
      </div>
    );
  }

  const live = drag ? swipeDirection(drag.x, drag.y, 60) : null;

  function commit(dir: SwipeDirection) {
    if (!top || leaving) return;
    const card = top;
    const draft = { tags, journal, journalOpen };
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setDrag(null);
    setLeaving(dir);
    let removed = false;
    const timer = window.setTimeout(
      () => {
        removed = true;
        setQueue((q) => q.filter((c) => c.id !== card.id));
        setSwiped((n) => n + 1);
        setLeaving(null);
        setTags([]);
        setJournal('');
        setJournalOpen(false);
      },
      reduce ? 0 : 200,
    );

    void (async () => {
      let message: string | undefined;
      let code: Parameters<typeof toast.error>[1];
      try {
        const res = await saveEventReflection(card.id, {
          verdict: SWIPE_VERDICT[dir],
          tags: draft.tags,
          journal: draft.journal,
        });
        if (res.ok) return;
        message = res.error;
        code = 'code' in res ? res.code : null;
      } catch {
        message = undefined;
      }
      // A save that fails inside the animation window: the card never left.
      if (!removed) {
        window.clearTimeout(timer);
        setLeaving(null);
        toast.error(message ?? 'Could not save that. Try again.', code);
        return;
      }
      // Put the card back on top with what was typed, so nothing is lost.
      setQueue((q) => [card, ...q.filter((c) => c.id !== card.id)]);
      setSwiped((n) => Math.max(0, n - 1));
      setTags(draft.tags);
      setJournal(draft.journal);
      setJournalOpen(draft.journalOpen);
      toast.error(message ?? 'Could not save that. Try again.', code);
    })();
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (leaving || (e.target as HTMLElement).closest('button, textarea')) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    setDrag({ x: e.clientX - s.x, y: e.clientY - s.y });
  }
  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dir = e.type === 'pointercancel' ? null : swipeDirection(e.clientX - s.x, e.clientY - s.y);
    if (dir) commit(dir);
    else setDrag(null);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('textarea')) return;
    const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[
      e.key
    ] as SwipeDirection | undefined;
    if (!dir) return;
    e.preventDefault();
    commit(dir);
  }

  const shown = leaving ?? live;
  const transform = leaving
    ? EXIT[leaving]
    : drag
      ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`
      : 'none';

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      <p className="text-xs text-ink-faint" aria-live="polite">
        {queue.length} {queue.length === 1 ? 'plan' : 'plans'} to look back on
      </p>

      <div className="relative">
        {queue[1] ? (
          <div
            aria-hidden
            className="absolute inset-x-3 top-3 h-full rounded-card border border-line bg-card opacity-70"
          />
        ) : null}

        <div
          role="group"
          tabIndex={0}
          aria-label={`${top.title}. Use the arrow keys or the buttons below to answer.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{
            transform,
            transition: drag && !leaving ? 'none' : 'transform 200ms ease-out',
            touchAction: 'none',
          }}
          className="relative select-none rounded-card border border-line bg-card p-5 shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
        >
          {shown ? (
            <span
              className={`pointer-events-none absolute right-4 top-4 rotate-6 rounded-btn border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${STAMP[shown]}`}
            >
              {VERDICT_LABEL[SWIPE_VERDICT[shown]]}
            </span>
          ) : null}

          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
            {ROLE_LABEL[top.role]}
          </p>
          <h4 className="mt-0.5 pr-24 text-lg font-bold leading-snug text-ink">{top.title}</h4>
          <p className="mt-0.5 text-sm text-ink-soft">
            {formatDate(top.startsAt, top.timeZone)}
            {top.place ? ` · ${top.place}` : ''}
          </p>

          <div className="my-5 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => setJournalOpen((o) => !o)}
              aria-expanded={journalOpen}
              aria-label={journal ? 'Edit your journal entry' : 'Write a journal entry'}
              className={`relative flex size-16 items-center justify-center rounded-full border-2 transition-colors ${
                journalOpen || journal
                  ? 'border-terracotta bg-terracotta-soft text-terracotta-deep'
                  : 'border-line bg-cream text-ink-soft hover:border-terracotta'
              }`}
            >
              <Icon name="edit" size={26} />
              {journal ? (
                <span className="absolute right-1 top-1 size-3 rounded-full bg-terracotta" />
              ) : null}
            </button>
            <span className="text-[11px] text-ink-faint">Journal (optional)</span>
            {journalOpen ? (
              <div className="w-full">
                <textarea
                  value={journal}
                  onChange={(e) => setJournal(e.target.value.slice(0, JOURNAL_MAX))}
                  rows={4}
                  autoFocus
                  placeholder="What stuck with you? Only you can read this."
                  className="w-full resize-none rounded-card border border-line bg-cream/50 p-3 text-sm text-ink focus:border-terracotta focus:outline-none"
                />
                <p className="text-right text-[11px] text-ink-faint">
                  {journal.length}/{JOURNAL_MAX}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-center gap-1.5" aria-label="Add detail">
            {DECK_TAGS.map((t) => {
              const on = tags.includes(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTags((cur) => (on ? cur.filter((k) => k !== t.key) : [...cur, t.key]))
                  }
                  className={`rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? 'border-terracotta bg-terracotta-soft text-terracotta-deep'
                      : 'border-line bg-card text-ink-soft hover:border-ink-faint'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 pt-1">
        {ACTIONS.map(({ dir, icon, hint }) => (
          <button
            key={dir}
            type="button"
            onClick={() => commit(dir)}
            disabled={Boolean(leaving)}
            aria-label={`${VERDICT_LABEL[SWIPE_VERDICT[dir]]} (${hint.toLowerCase()})`}
            className="flex flex-col items-center gap-1 rounded-card border border-line bg-card py-2 text-ink-soft transition-all hover:border-terracotta active:scale-95 disabled:opacity-50"
          >
            <Icon name={icon} size={20} />
            <span className="text-[11px] font-medium leading-none">
              {VERDICT_LABEL[SWIPE_VERDICT[dir]]}
            </span>
          </button>
        ))}
      </div>
      <p className="text-center text-[11px] text-ink-faint">
        Left: not for me · Right: liked · Up: loved · Down: didn’t go
      </p>
    </div>
  );
}
