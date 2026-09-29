'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { CreateEventInput } from '@/lib/actions/events';
import type { EventTheme, InviteMode } from '@/lib/types';
import { EVENT_THEMES } from '@/lib/themes';
import { FIELD, MODE_OPTIONS } from './wizard-types';
import { ResponseWindowPicker } from './ResponseWindowPicker';
import { PollSeedOptions } from './PollSeedOptions';

interface StyleStepProps {
  inviteMode: InviteMode;
  /** Picking a rhythm can add or drop the "Set the order" step, so the
   *  wizard's own handler is what sets it — never a bare state setter. */
  setInviteMode: (mode: InviteMode) => void;
  enablePoll: boolean;
  setEnablePoll: Dispatch<SetStateAction<boolean>>;
  pollResolution: CreateEventInput['pollResolution'];
  setPollResolution: Dispatch<SetStateAction<CreateEventInput['pollResolution']>>;
  suggestDeadline: string;
  setSuggestDeadline: Dispatch<SetStateAction<string>>;
  voteDeadline: string;
  setVoteDeadline: Dispatch<SetStateAction<string>>;
  /** Ideas to open the first poll with. Optional. */
  pollOptions: string[];
  setPollOptions: Dispatch<SetStateAction<string[]>>;
  minDate: string;
  remindersEnabled: boolean;
  setRemindersEnabled: Dispatch<SetStateAction<boolean>>;
  theme: EventTheme;
  setTheme: Dispatch<SetStateAction<EventTheme>>;
  /** How many people are on the list, so the copy can speak about them. */
  inviteeCount: number;
  /**
   * When the order step is skipped (everyone at once, or one person), the
   * response window is asked here instead, so it is never silently defaulted.
   */
  showWindow: boolean;
  commonWindow: number | null;
  setWindowForEveryone: (minutes: number) => void;
  suggested: { windowMinutes: number; label: string };
}

export function StyleStep({
  inviteMode,
  setInviteMode,
  enablePoll,
  setEnablePoll,
  pollResolution,
  setPollResolution,
  suggestDeadline,
  setSuggestDeadline,
  voteDeadline,
  setVoteDeadline,
  pollOptions,
  setPollOptions,
  minDate,
  remindersEnabled,
  setRemindersEnabled,
  theme,
  setTheme,
  inviteeCount,
  showWindow,
  commonWindow,
  setWindowForEveryone,
  suggested,
}: StyleStepProps) {
  return (
        <div className="space-y-3 animate-rise">
          {MODE_OPTIONS.map((option) => {
            const active = inviteMode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setInviteMode(option.mode)}
                aria-pressed={active}
                className={`w-full text-left rounded-card border-2 p-4 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                  active
                    ? 'border-terracotta bg-terracotta-soft shadow-lift'
                    : 'border-line bg-card hover:border-terracotta/50'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span
                    className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl transition-colors ${
                      active ? 'bg-card shadow-lift' : 'bg-cream'
                    }`}
                    aria-hidden
                  >
                    {option.emoji}
                  </span>
                  <div className="flex-1">
                    <p className={`font-extrabold ${active ? 'text-terracotta-deep' : 'text-ink'}`}>
                      {option.title}
                    </p>
                    <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">{option.body}</p>
                  </div>
                  <span
                    aria-hidden
                    className={`grid size-6 shrink-0 place-items-center rounded-pill border-2 transition-colors ${
                      active
                        ? 'border-terracotta bg-terracotta text-white'
                        : 'border-line text-transparent'
                    }`}
                  >
                    <Icon name="check" size={14} />
                  </span>
                </div>
              </button>
            );
          })}

          {showWindow && (
            <ResponseWindowPicker
              label={inviteeCount > 1 ? 'Everyone gets' : 'Time to respond'}
              commonWindow={commonWindow}
              setWindowForEveryone={setWindowForEveryone}
              suggested={suggested}
              hint={
                inviteeCount > 1
                  ? 'How long each person has to answer before the invitation lapses.'
                  : 'How long they have to answer before the invitation lapses.'
              }
            />
          )}

          <Card tone="cream" className="mt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enablePoll}
                onChange={(e) => setEnablePoll(e.target.checked)}
                className="mt-1 size-4 accent-terracotta"
              />
              <span>
                <span className="font-bold">Let the group decide what to do 🗳️</span>
                <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
                  Attendees suggest ideas and rank them privately. The best fit
                  wins - no debates, no loudest-voice problem.
                </span>
              </span>
            </label>
            {enablePoll && (
              <div className="mt-3 space-y-3 pl-7">
                <PollSeedOptions options={pollOptions} setOptions={setPollOptions} />
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['host_pick', 'I pick from top ideas'],
                      ['auto', 'Auto-pick the winner'],
                      ['runoff', 'Final runoff vote'],
                    ] as const
                  ).map(([value, label]) => (
                    <Chip
                      key={value}
                      selected={pollResolution === value}
                      onClick={() => setPollResolution(value)}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="suggestDeadline" className="text-xs font-bold text-ink-soft">
                      Suggestions close
                    </label>
                    <input
                      id="suggestDeadline"
                      type="datetime-local"
                      value={suggestDeadline}
                      onChange={(e) => setSuggestDeadline(e.target.value)}
                      className={`${FIELD} py-2.5 text-sm`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="voteDeadline" className="text-xs font-bold text-ink-soft">
                      Voting closes (optional)
                    </label>
                    <input
                      id="voteDeadline"
                      type="datetime-local"
                      value={voteDeadline}
                      min={minDate ? `${minDate}T00:00` : undefined}
                      onChange={(e) => setVoteDeadline(e.target.value)}
                      className={`${FIELD} py-2.5 text-sm`}
                    />
                  </div>
                </div>
                <p className="text-xs text-ink-faint">
                  {pollResolution === 'host_pick'
                    ? 'Voting closes at this time, then you choose from the results.'
                    : pollResolution === 'runoff'
                      ? 'At this time, the leading ideas move to a final round with the same voting time as the first round. Its closing time appears on the poll.'
                      : 'Voting closes at this time. A clear winner is picked automatically; you settle any tie.'}{' '}
                  Leave blank to close voting whenever you’re ready.
                </p>
              </div>
            )}
          </Card>

          <Card tone="cream" className="mt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={remindersEnabled}
                onChange={(e) => setRemindersEnabled(e.target.checked)}
                className="mt-1 size-4 accent-terracotta"
              />
              <span>
                <span className="font-bold">Send a reminder before it starts ⏰</span>
                <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
                  A gentle nudge goes to people who said yes a few hours ahead.
                  Turn this off for a low-key plan that doesn’t need one.
                </span>
              </span>
            </label>
          </Card>

          <Card tone="cream" className="mt-2">
            <p className="font-bold">Theme</p>
            <p className="text-sm text-ink-soft mt-0.5 mb-2.5 leading-relaxed">
              A color for the plan card. Optional.
            </p>
            <div className="flex flex-wrap gap-2">
              {EVENT_THEMES.map((option) => {
                const active = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTheme(option.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-pill border-2 py-1.5 pl-1.5 pr-3.5 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                      active
                        ? 'border-terracotta bg-terracotta-soft'
                        : 'border-line bg-card hover:border-terracotta/50'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`size-6 rounded-full shadow-lift plan-${option.color}`}
                    />
                    <span className="text-sm font-bold">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
  );
}
