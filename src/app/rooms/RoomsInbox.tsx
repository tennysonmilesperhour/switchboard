'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { searchMessages, type MessageHit } from '@/lib/actions/rooms';
import { createClient } from '@/lib/supabase/client';
import { subscribeAuthorized } from '@/lib/supabase/realtime';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { formatRelative } from '@/lib/format';

export interface InboxRoom {
  id: string;
  kind: string;
  title: string;
  people: string[];
  preview: string;
  activityAt: string;
  unread: boolean;
  /** Muted by this member: no notifications, still listed (D20). */
  muted: boolean;
  section: 'active' | 'matches' | 'past';
}

/** Realtime `in` filters take at most 100 values. */
const MAX_FILTERED_ROOMS = 100;

const ICONS: Record<string, IconName> = { event: 'calendar', match: 'sparkle', group: 'users', moment: 'sparkle' };
const SECTIONS = [
  { key: 'active', label: 'Active' },
  { key: 'matches', label: 'Matches' },
  { key: 'past', label: 'Past' },
] as const;

export function RoomsInbox({ rooms }: { rooms: InboxRoom[] }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MessageHit[]>([]);
  const [searching, startSearch] = useTransition();
  const router = useRouter();

  /**
   * Live inbox (G12). The bell's notification feed only refreshes this page
   * for rooms that notify you, which leaves out muted rooms and one you were
   * just reading. So the inbox listens to new messages in its own rooms and
   * re-reads, coalesced so a burst is one refresh. RLS on `messages` limits
   * delivery to rooms this person is in; the filter keeps the server from
   * checking every other room's traffic against them. A filter holds at most
   * 100 rooms, so someone in more follows their 100 most recently active.
   */
  const roomKey = [...rooms]
    .sort((a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime())
    .slice(0, MAX_FILTERED_ROOMS)
    .map((room) => room.id)
    .sort()
    .join(',');
  useEffect(() => {
    const ids = roomKey ? roomKey.split(',') : [];
    if (ids.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 500);
    };
    let stop: (() => void) | null = null;
    try {
      const supabase = createClient();
      const channel = supabase
        .channel('rooms-inbox')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_id=in.(${ids.join(',')})`,
          },
          refresh,
        );
      stop = subscribeAuthorized(supabase, channel);
    } catch {
      // Realtime unavailable: the inbox still refreshes on navigation.
      stop = null;
    }
    return () => {
      if (timer) clearTimeout(timer);
      stop?.();
    };
  }, [roomKey, router]);

  /**
   * The room filter above is instant because the rooms are already here. What
   * was *said* in them is not, so it takes a round trip — debounced, because a
   * query per keystroke is a query per keystroke.
   *
   * Results are additive: filtering by room title still works exactly as it
   * did, and message hits appear underneath. Someone searching an address they
   * remember reading gets it whether they recall which room it was in.
   */
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      startSearch(async () => {
        try {
          setHits(await searchMessages(trimmed));
        } catch {
          // A failed search shows no results rather than an error: the room
          // filter above still works, and the page is not broken.
          setHits([]);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Derived rather than cleared in the effect: whether to show message hits is
  // a function of the current query, so making it one removes the need to keep
  // a second copy of that fact in sync — and with it the stale-results window
  // where clearing the box still showed the last search.
  const shownHits = query.trim().length >= 2 ? hits : [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rooms
      .filter((room) => !needle || `${room.title} ${room.people.join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime());
  }, [query, rooms]);

  return <div className="space-y-5">
    <label className="block">
      <span className="sr-only">Search rooms by title or person</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rooms or people…" className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-terracotta" />
    </label>
    {SECTIONS.map(({ key, label }) => {
      const sectionRooms = filtered.filter((room) => room.section === key);
      if (!sectionRooms.length) return null;
      return <section key={key}>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{label}</h2>
        <div className="space-y-2.5">{sectionRooms.map((room) => <Link key={room.id} href={`/rooms/${room.id}`} className="block group">
          <Card className="group-hover:border-terracotta transition-colors">
            <div className="flex items-center gap-3">
              <span className="relative size-11 shrink-0 rounded-full bg-terracotta-soft text-terracotta-deep inline-flex items-center justify-center" aria-hidden>
                <Icon name={ICONS[room.kind] ?? 'chat'} size={20} />
                {room.unread && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-surface bg-terracotta" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2"><p className={`truncate ${room.unread ? 'font-extrabold' : 'font-bold'}`}>{room.unread && <span className="sr-only">Unread: </span>}{room.title}</p><span className="shrink-0 text-[11px] text-ink-faint">{room.muted && <span className="mr-1.5">Muted ·</span>}{formatRelative(room.activityAt)}</span></div>
                <p className="truncate text-xs text-ink-muted">{room.preview}</p>
                {room.people.length > 0 && <p className="truncate text-[11px] text-ink-faint">{room.people.join(', ')}</p>}
              </div>
            </div>
          </Card>
        </Link>)}</div>
      </section>;
    })}
    {shownHits.length > 0 && (
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">
          In messages
        </h2>
        <ul className="space-y-1.5">
          {shownHits.map((hit) => (
            <li key={hit.id}>
              <Link
                href={`/rooms/${hit.roomId}`}
                className="block rounded-xl border border-border bg-surface px-4 py-3 hover:border-ink-faint"
              >
                <p className="text-xs font-bold text-ink-faint">
                  {hit.senderName} · {hit.roomTitle} · {formatRelative(hit.createdAt)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft break-words">{hit.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )}
    {filtered.length === 0 && shownHits.length === 0 && (
      <p className="py-8 text-center text-sm text-ink-muted">
        {searching ? 'Searching…' : 'Nothing matches that search.'}
      </p>
    )}
  </div>;
}
