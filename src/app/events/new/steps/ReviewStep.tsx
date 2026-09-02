'use client';

import { Card } from '@/components/ui/Card';
import { HostSuggestions } from '@/components/events/HostSuggestions';
import { recurrenceLabel, type RecurrenceKind } from '@/lib/engine/recurrence';
import type { CascadePreviewEntry } from '@/lib/engine/cascade';
import type { HostSuggestion } from '@/lib/engine/suggestions';
import type { InviteMode } from '@/lib/types';
import { MODE_OPTIONS, type DraftInvitee } from './wizard-types';

interface ReviewStepProps {
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  locationName: string;
  invitees: DraftInvitee[];
  inviteMode: InviteMode;
  capacity: string;
  enablePoll: boolean;
  recurrence: RecurrenceKind;
  customDays: string;
  suggestions: HostSuggestion[];
  looksOutdoor: boolean;
  preview: CascadePreviewEntry[];
}

export function ReviewStep({
  title,
  startsAt,
  endsAt,
  locationName,
  invitees,
  inviteMode,
  capacity,
  enablePoll,
  recurrence,
  customDays,
  suggestions,
  looksOutdoor,
  preview,
}: ReviewStepProps) {
  return (
        <div className="space-y-4 animate-rise">
          <Card lifted>
            <h3 className="text-2xl font-black tracking-tight text-ink">{title || 'Untitled plan'}</h3>
            <p className="text-sm text-ink-soft mt-1">
              {startsAt
                ? new Intl.DateTimeFormat('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  }).format(new Date(startsAt))
                : 'Time TBD'}
              {endsAt
                ? ` - ${new Intl.DateTimeFormat('en-US', {
                    hour: 'numeric', minute: '2-digit',
                  }).format(new Date(endsAt))}`
                : ''}
              {locationName ? ` · ${locationName}` : ''}
            </p>
            <p className="text-sm text-ink-faint mt-1">
              {invitees.length} invitee{invitees.length === 1 ? '' : 's'} ·{' '}
              {MODE_OPTIONS.find((o) => o.mode === inviteMode)?.title}
              {capacity ? ` · ${capacity} spots` : ''}
              {enablePoll ? ' · group decides activity' : ''}
            </p>
            {recurrence !== 'none' && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-terracotta-soft px-3 py-1 text-xs font-bold text-terracotta-deep">
                🔁 {recurrenceLabel(recurrence, Number(customDays) || null)}
              </p>
            )}
          </Card>

          <HostSuggestions suggestions={suggestions} />

          {looksOutdoor && (
            <Card tone="gold">
              <p className="text-sm leading-relaxed">
                🌤️ This looks like an outdoor plan - worth a quick peek at the
                forecast before you send it, so you have a plan B if the weather
                turns.
              </p>
            </Card>
          )}

          {!enablePoll && preview.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-ink mb-2">
                If nobody responds, here’s how invitations will flow:
              </h4>
              <ol className="space-y-1.5">
                {preview.map((entry) => {
                  const invitee = invitees.find((i) => i.key === entry.id);
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 text-sm rounded-card bg-cream px-3.5 py-2.5"
                    >
                      <span className="text-terracotta" aria-hidden>→</span>
                      <span className="font-bold flex-1">{invitee?.name}</span>
                      <span className="text-ink-faint text-xs">
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        }).format(entry.wouldSendAt)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-ink-faint mt-2">
                In reality it usually goes much faster - the moment someone
                accepts, the flow stops.
              </p>
            </div>
          )}

          {enablePoll && (
            <Card tone="gold">
              <p className="text-sm leading-relaxed">
                🗳️ This plan starts in <strong>deciding mode</strong> - invitees
                will suggest and rank ideas first. You’ll send the cascade once
                the group settles on what to do.
              </p>
            </Card>
          )}
        </div>
  );
}
