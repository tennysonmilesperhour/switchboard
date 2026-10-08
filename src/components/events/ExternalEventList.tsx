'use client';

import { useMemo, useState, useTransition } from 'react';
import { Card } from '@/components/ui/Card';
import { setExternalEventPreference, submitExternalEventUrl } from '@/lib/actions/external-events';
import { googleCalendarUrl } from '@/lib/calendar-links';

export interface ExternalEventCard {
  id: string; title: string; description: string | null; starts_at: string; ends_at: string;
  venue_name: string | null; city: string; category: string | null; canonical_url: string;
  ticket_url: string | null; price_label: string | null; is_free: boolean | null;
  age_label: string | null; tags: string[]; accessibility: string[]; confidence: number; last_seen_at: string;
}
type Window = 'tonight' | 'weekend' | 'week' | 'all';

const formatWhen = (iso: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(iso));

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function inWindow(event: ExternalEventCard, window: Window, now: Date) {
  if (window === 'all') return true;
  const eventParts = localParts(new Date(event.starts_at));
  const nowParts = localParts(now);
  const eventDay = `${eventParts.year}-${eventParts.month}-${eventParts.day}`;
  const today = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  if (window === 'tonight') return eventDay === today && +eventParts.hour >= 16;
  const days = (new Date(`${eventDay}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000;
  if (window === 'week') return days >= 0 && days <= 7;
  const weekday = new Date(`${eventDay}T12:00:00Z`).getUTCDay();
  return days >= 0 && days <= 6 && (weekday === 5 || weekday === 6 || weekday === 0);
}

export function ExternalEventList({ events, initialPreferences, interests }: {
  events: ExternalEventCard[]; initialPreferences: Record<string, 'saved' | 'hidden'>; interests: string[];
}) {
  const [window, setWindow] = useState<Window>('tonight');
  const [freeOnly, setFreeOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [preferences, setPreferences] = useState(initialPreferences);
  const [showSubmit, setShowSubmit] = useState(false);
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => events.filter((event) => {
    if (preferences[event.id] === 'hidden' || !inWindow(event, window, new Date())) return false;
    if (freeOnly && event.is_free !== true) return false;
    const term = query.trim().toLocaleLowerCase();
    return !term || [event.title, event.description, event.venue_name, event.category].some((value) => value?.toLocaleLowerCase().includes(term));
  }).sort((a, b) => {
    const score = (event: ExternalEventCard) => interests.reduce((total, interest) => {
      const term = interest.toLocaleLowerCase();
      return total + ([event.title, event.description, event.category, ...event.tags].some((value) => value?.toLocaleLowerCase().includes(term)) ? 1 : 0);
    }, preferences[event.id] === 'saved' ? 10 : 0);
    return score(b) - score(a) || Date.parse(a.starts_at) - Date.parse(b.starts_at);
  }), [events, freeOnly, interests, preferences, query, window]);

  function preference(eventId: string, state: 'saved' | 'hidden' | null) {
    const previous = preferences[eventId];
    setPreferences((current) => { const next = { ...current }; if (state) next[eventId] = state; else delete next[eventId]; return next; });
    startTransition(async () => {
      const result = await setExternalEventPreference(eventId, state);
      if (!result.ok) {
        setPreferences((current) => { const next = { ...current }; if (previous) next[eventId] = previous; else delete next[eventId]; return next; });
        setNotice(result.error ?? 'Could not save that change.');
      }
    });
  }

  return (
    <section aria-labelledby="external-events-title" className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta-deep">Around Salt Lake</p><h2 id="external-events-title" className="mt-1 text-xl font-black">What’s actually happening</h2></div>
        <button className="text-sm font-bold text-terracotta-deep underline" onClick={() => setShowSubmit((value) => !value)}>Add a missing event</button>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Event filters">
        {(['tonight', 'weekend', 'week', 'all'] as Window[]).map((value) => <button key={value} aria-pressed={window === value} onClick={() => setWindow(value)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${window === value ? 'bg-terracotta text-white' : 'bg-card border border-line'}`}>{value === 'week' ? 'Next 7 days' : value[0].toUpperCase() + value.slice(1)}</button>)}
        <button aria-pressed={freeOnly} onClick={() => setFreeOnly((value) => !value)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${freeOnly ? 'bg-sage text-ink' : 'bg-card border border-line'}`}>Free</button>
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Music, pottery, hiking, comedy…" aria-label="Search events" className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm" />
      {showSubmit && <Card tone="cream"><form action={(formData) => startTransition(async () => { const result = await submitExternalEventUrl(String(formData.get('url') ?? ''), String(formData.get('note') ?? '')); setNotice(result.ok ? 'Thanks — the link is in the review queue.' : result.error ?? 'Could not submit that link.'); if (result.ok) setShowSubmit(false); })} className="space-y-2"><label className="block text-sm font-bold">Public event link<input name="url" type="url" required placeholder="https://…" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label><label className="block text-sm font-bold">Anything we should know?<textarea name="note" maxLength={500} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal" /></label><button disabled={pending} className="rounded-full bg-terracotta px-4 py-2 text-sm font-bold text-white">Send for review</button></form></Card>}
      {notice && <p role="status" className="text-sm text-ink-muted">{notice}</p>}
      {visible.length === 0 ? <Card><p className="text-sm text-ink-muted">Nothing matches those filters yet. Try the next seven days or add a missing event.</p></Card> : <div className="grid gap-3 sm:grid-cols-2">{visible.map((event) => <Card key={event.id} className="flex h-full flex-col gap-2"><div className="flex flex-wrap gap-2 text-xs font-bold text-terracotta-deep"><span>{formatWhen(event.starts_at)}</span>{event.category && <span>· {event.category}</span>}{event.is_free && <span>· Free</span>}</div><h3 className="text-base font-black text-ink">{event.title}</h3>{(event.venue_name || event.city) && <p className="text-sm text-ink-muted">{[event.venue_name, event.city].filter(Boolean).join(' · ')}</p>}{event.description && <p className="line-clamp-3 text-sm text-ink-muted">{event.description}</p>}<div className="mt-auto flex flex-wrap items-center gap-3 pt-2"><a className="text-sm font-bold text-terracotta-deep underline underline-offset-4" href={event.ticket_url ?? event.canonical_url} target="_blank" rel="noreferrer">{event.ticket_url ? 'Sign up or get tickets' : 'Organizer details'}</a><a className="text-sm font-bold text-ink-muted" href={googleCalendarUrl({ title: event.title, description: event.description, location: event.venue_name, startsAt: event.starts_at, endsAt: event.ends_at })} target="_blank" rel="noreferrer">Add to calendar</a><a className="text-sm font-bold text-ink-muted" href={`/events/new?title=${encodeURIComponent(event.title)}&description=${encodeURIComponent(event.description ?? '')}`}>Make a plan</a><button disabled={pending} onClick={() => preference(event.id, preferences[event.id] === 'saved' ? null : 'saved')} className="text-sm font-bold text-ink-muted">{preferences[event.id] === 'saved' ? 'Saved' : 'Save'}</button><button disabled={pending} onClick={() => preference(event.id, 'hidden')} className="text-sm text-ink-faint">Hide</button></div><p className="text-[11px] text-ink-faint">Verified {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' }).format(new Date(event.last_seen_at))} · {event.confidence}% source confidence</p></Card>)}</div>}
    </section>
  );
}
