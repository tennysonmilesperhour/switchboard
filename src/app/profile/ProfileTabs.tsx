'use client';

import { useState } from 'react';
import { PlanCard, planColor } from '@/components/ui/PlanCard';
import { formatDateTime } from '@/lib/format';

export interface ProfileEvent {
  id: string;
  title: string;
  starts_at: string | null;
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
        {tab === 'activity' && (
          <p className="py-10 text-center text-sm text-ink-faint">
            Your activity will show up here.
          </p>
        )}
      </div>
    </div>
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
          when={event.starts_at ? formatDateTime(event.starts_at) : undefined}
          where={event.location_name ?? undefined}
        />
      ))}
    </>
  );
}
