'use client';

import { useMemo, useState } from 'react';
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
  section: 'active' | 'matches' | 'past';
}

const ICONS: Record<string, IconName> = { event: 'calendar', match: 'sparkle', group: 'users', moment: 'sparkle' };
const SECTIONS = [
  { key: 'active', label: 'Active' },
  { key: 'matches', label: 'Matches' },
  { key: 'past', label: 'Past' },
] as const;

export function RoomsInbox({ rooms }: { rooms: InboxRoom[] }) {
  const [query, setQuery] = useState('');
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
                <div className="flex items-baseline justify-between gap-2"><p className={`truncate ${room.unread ? 'font-extrabold' : 'font-bold'}`}>{room.title}</p><span className="shrink-0 text-[11px] text-ink-faint">{formatRelative(room.activityAt)}</span></div>
                <p className="truncate text-xs text-ink-muted">{room.preview}</p>
                {room.people.length > 0 && <p className="truncate text-[11px] text-ink-faint">{room.people.join(', ')}</p>}
              </div>
            </div>
          </Card>
        </Link>)}</div>
      </section>;
    })}
    {filtered.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">No rooms match that search.</p>}
  </div>;
}
