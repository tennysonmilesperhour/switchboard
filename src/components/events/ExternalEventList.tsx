import { Card } from '@/components/ui/Card';

export interface ExternalEventCard {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  venue_name: string | null;
  city: string;
  category: string | null;
  canonical_url: string;
  ticket_url: string | null;
  price_label: string | null;
}

function when(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso));
}

export function ExternalEventList({ events }: { events: ExternalEventCard[] }) {
  return (
    <section aria-labelledby="external-events-title" className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-terracotta-deep">Around Salt Lake</p>
        <h2 id="external-events-title" className="mt-1 text-xl font-black">What’s actually happening</h2>
        <p className="mt-1 text-sm text-ink-muted">Fresh listings from local calendars. Open one to register or get the details from the organizer.</p>
      </div>
      {events.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">The local calendar is warming up. Check back after the next source sweep.</p></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((event) => (
            <Card key={event.id} className="flex h-full flex-col gap-2">
              <div className="flex flex-wrap gap-2 text-xs font-bold text-terracotta-deep">
                <span>{when(event.starts_at)}</span>
                {event.category && <span>· {event.category}</span>}
              </div>
              <h3 className="text-base font-black text-ink">{event.title}</h3>
              {(event.venue_name || event.city) && <p className="text-sm text-ink-muted">{[event.venue_name, event.city].filter(Boolean).join(' · ')}</p>}
              {event.description && <p className="line-clamp-3 text-sm text-ink-muted">{event.description}</p>}
              <a className="mt-auto pt-2 text-sm font-bold text-terracotta-deep underline underline-offset-4" href={event.ticket_url ?? event.canonical_url} target="_blank" rel="noreferrer">
                {event.ticket_url ? 'Sign up or get tickets' : 'See organizer details'}
              </a>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
