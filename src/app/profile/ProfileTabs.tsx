'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlanCard, planColor } from '@/components/ui/PlanCard';
import { formatDateTime } from '@/lib/format';

export interface ProfileEvent {
  id: string;
  title: string;
  starts_at: string | null;
  /** IANA zone the plan was created in; passed to `formatDateTime` so the
   * server (UTC) and client (viewer's zone) render the same text and don't
   * trip a hydration mismatch (React #418). */
  time_zone: string | null;
  location_name: string | null;
  status: string;
}

type TabKey = 'created' | 'attended' | 'activity';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'created', label: 'Created' },
  { key: 'attended', label: 'Attended' },
  { key: 'activity', label: 'Activity' },
];

interface ProfileTabsProps {
  created: ProfileEvent[];
  attended: ProfileEvent[];
}

export function ProfileTabs({ created, attended }: ProfileTabsProps) {
  const [tab, setTab] = useState<TabKey>('created');

  return (
    <div>
      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex border-b border-line"
      >
        {TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`flex-1 pb-3 pt-1 text-sm font-bold transition-colors ${
                active
                  ? 'text-ink border-b-2 border-terracotta'
                  : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-3">
        {tab === 'created' && <EventList events={created} empty="No plans created yet." />}
        {tab === 'attended' && <EventList events={attended} empty="No plans attended yet." />}
        {tab === 'activity' && <ActivityFeed created={created} attended={attended} />}
      </div>
    </div>
  );
}

/** A single time-sorted timeline merging hosted and attended plans. */
function ActivityFeed({
  created,
  attended,
}: {
  created: ProfileEvent[];
  attended: ProfileEvent[];
}) {
  const items = [
    ...created.map((event) => ({ event, role: 'Hosted' as const })),
    ...attended.map((event) => ({ event, role: 'Went to' as const })),
  ].sort((a, b) => {
    const at = a.event.starts_at ? Date.parse(a.event.starts_at) : 0;
    const bt = b.event.starts_at ? Date.parse(b.event.starts_at) : 0;
    return bt - at;
  });

  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-faint">
        Your plans will show up here as a timeline.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {items.map(({ event, role }) => (
        <li
          key={`${role}-${event.id}`}
          className="flex items-center gap-3 rounded-card border border-line bg-card px-3.5 py-3"
        >
          <span className="rounded-pill bg-cream px-2 py-0.5 text-[11px] font-bold text-ink-soft shrink-0">
            {role}
          </span>
          <span className="min-w-0 flex-1">
            <Link
              href={`/events/${event.id}`}
              className="block truncate text-sm font-bold text-ink hover:text-terracotta-deep"
            >
              {event.title}
            </Link>
            {event.starts_at && (
              <span className="block text-xs text-ink-faint">
                {formatDateTime(event.starts_at, event.time_zone)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EventList({ events, empty }: { events: ProfileEvent[]; empty: string }) {
  if (events.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-faint">{empty}</p>;
  }
  return (
    <>
      {events.map((event, i) => (
        <PlanCard
          key={event.id}
          variant="compact"
          href={`/events/${event.id}`}
          title={event.title}
          color={planColor(i)}
          when={event.starts_at ? formatDateTime(event.starts_at, event.time_zone) : undefined}
          where={event.location_name ?? undefined}
        />
      ))}
    </>
  );
}
