'use client';

import { Glyph } from '@/components/ui/Glyph';
import { Card } from '@/components/ui/Card';
import { ReorderableList } from '@/components/ui/ReorderableList';
import { HostSuggestions } from '@/components/events/HostSuggestions';
import { recurrenceLabel, type RecurrenceKind } from '@/lib/engine/recurrence';
import type { CascadePreviewEntry } from '@/lib/engine/cascade';
import type { HostSuggestion } from '@/lib/engine/suggestions';
import { isStaggered, orderMatters, rhythmLine } from '@/lib/invite-rhythm';
import type { DuplicateWarning } from '@/lib/invitee-dedupe';
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
  /** Move an invitee up or down the line. */
  moveInvitee: (from: number, to: number) => void;
  /** Take someone off the plan before it goes out. */
  removeInvitee: (key: string) => void;
  /** Switch the rhythm from here, without walking back three steps. */
  setInviteMode: (mode: InviteMode) => void;
  /** Rows that may be one person twice, still unanswered by the host. */
  duplicates: DuplicateWarning[];
  /** "Not a repeat" — stop asking about this pair. */
  keepBothDuplicates: (warning: DuplicateWarning) => void;
}

const TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

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
  moveInvitee,
  removeInvitee,
  setInviteMode,
  duplicates,
  keepBothDuplicates,
}: ReviewStepProps) {
  // Two different questions, both answered by `invite-rhythm` so this screen
  // and the plan page can never describe the same plan differently. A grip
  // only appears where a row's position decides something; a send time only
  // appears where the invitations actually leave at different moments.
  const ordered = orderMatters(inviteMode);
  const staggered = isStaggered(inviteMode);
  const sendAt = new Map(preview.map((entry) => [entry.id, entry.wouldSendAt]));
  const duplicateFor = new Map(duplicates.map((warning) => [warning.dropKey, warning]));
  const nameOf = (key: string) => invitees.find((i) => i.key === key)?.name ?? 'someone';

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
              {capacity ? ` · ${capacity} spot${capacity === '1' ? '' : 's'}` : ''}
              {enablePoll ? ' · group decides activity' : ''}
            </p>
            {recurrence !== 'none' && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-terracotta-soft px-3 py-1 text-xs font-bold text-terracotta-deep">
                <Glyph emoji="🔁" size={14} className="inline -mt-0.5 mr-1" />{recurrenceLabel(recurrence, Number(customDays) || null)}
              </p>
            )}
          </Card>

          <HostSuggestions suggestions={suggestions} />

          {looksOutdoor && (
            <Card tone="gold">
              <p className="text-sm leading-relaxed">
                <Glyph emoji="🌤" size={14} className="inline -mt-0.5 mr-1" />This looks like an outdoor plan - worth a quick peek at the
                forecast before you send it, so you have a plan B if the weather
                turns.
              </p>
            </Card>
          )}

          {invitees.length > 0 && (
            <div>
              {/* `text-plate` is inert on every ordinary theme; under a photo
                  wallpaper it puts this heading on a surface instead of on the
                  picture. */}
              <div className="text-plate text-plate-inset mb-2">
                <h4 className="text-sm font-bold text-ink">
                  {enablePoll
                    ? 'Who is in on the decision'
                    : ordered
                      ? 'The order invitations go out in'
                      : staggered
                        ? 'When invitations go out'
                        : 'Who this goes to'}
                </h4>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {ordered
                    ? 'Drag anyone by the handle to change the order, or tap the x to take them off.'
                    : 'Tap the x to take anyone off before it goes out.'}
                </p>
              </div>

              {!enablePoll && !staggered && (
                <Card tone="cream" className="mb-2">
                  <p className="text-sm leading-relaxed text-ink-soft">
                    <Glyph emoji="📣" size={14} className="inline -mt-0.5 mr-1" /><strong>Everyone hears at the same moment.</strong>{' '}
                    {rhythmLine(inviteMode, invitees.length)}
                  </p>
                  {invitees.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setInviteMode('individual')}
                      className="mt-2 rounded-pill bg-terracotta-soft px-3 py-1.5 text-xs font-bold text-terracotta-deep transition-colors hover:bg-terracotta hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    >
                      Ask them one at a time instead
                    </button>
                  )}
                </Card>
              )}

              <ReorderableList
                aria-label="Invitees"
                items={invitees.map((invitee) => ({ ...invitee, label: invitee.name }))}
                onReorder={ordered ? moveInvitee : undefined}
                onRemove={(item) => removeInvitee(item.key)}
                removeLabel={(item) => `Take ${item.name} off this plan`}
                rowClassName={(item) =>
                  duplicateFor.has(item.key) ? 'bg-gold-soft' : 'bg-cream'
                }
              >
                {(item, index) => {
                  const warning = duplicateFor.get(item.key);
                  const when = sendAt.get(item.key);
                  return (
                    <>
                      <span className="flex items-center gap-2">
                        {ordered && (
                          <span className="grid size-5 shrink-0 place-items-center rounded-pill bg-terracotta text-[11px] font-extrabold text-white">
                            {index + 1}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 break-words text-sm font-bold text-ink">
                          {item.name}
                        </span>
                        {!item.profileId && (
                          <span className="shrink-0 rounded-pill bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-deep">
                            guest
                          </span>
                        )}
                      </span>
                      {!enablePoll && (
                        <span className={`mt-1 block text-xs text-ink-faint${ordered ? ' pl-7' : ''}`}>
                          {staggered && when ? TIME.format(when) : 'right away'}
                        </span>
                      )}
                      {warning && (
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gold-deep">
                          <span>
                            {warning.reason === 'target'
                              ? `Same contact as ${nameOf(warning.keepKey)}.`
                              : `Could this be ${nameOf(warning.keepKey)} again?`}
                          </span>
                          <button
                            type="button"
                            onClick={() => keepBothDuplicates(warning)}
                            className="rounded-pill bg-card px-2 py-0.5 font-bold text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                          >
                            Two different people
                          </button>
                        </span>
                      )}
                    </>
                  );
                }}
              </ReorderableList>

              {!enablePoll && staggered && (
                <p className="text-plate text-plate-inset mt-2 inline-block text-xs text-ink-faint">
                  In reality it usually goes much faster - the moment someone
                  accepts, the flow stops.
                </p>
              )}
            </div>
          )}

          {enablePoll && (
            <Card tone="gold">
              <p className="text-sm leading-relaxed">
                <Glyph emoji="🗳" size={14} className="inline -mt-0.5 mr-1" />This plan starts in <strong>deciding mode</strong> - invitees
                will suggest and rank ideas first. You’ll send the invitations once
                the group settles on what to do.
              </p>
            </Card>
          )}
        </div>
  );
}
