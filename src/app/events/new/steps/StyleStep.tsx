'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { CreateEventInput } from '@/lib/actions/events';
import type { EventTheme, InviteMode } from '@/lib/types';
import { EVENT_THEMES } from '@/lib/themes';
import { FIELD, MODE_OPTIONS } from './wizard-types';

interface StyleStepProps {
  inviteMode: InviteMode;
  setInviteMode: Dispatch<SetStateAction<InviteMode>>;
  enablePoll: boolean;
  setEnablePoll: Dispatch<SetStateAction<boolean>>;
  pollResolution: CreateEventInput['pollResolution'];
  setPollResolution: Dispatch<SetStateAction<CreateEventInput['pollResolution']>>;
  suggestDeadline: string;
  setSuggestDeadline: Dispatch<SetStateAction<string>>;
  voteDeadline: string;
  setVoteDeadline: Dispatch<SetStateAction<string>>;
  minDate: string;
  remindersEnabled: boolean;
  setRemindersEnabled: Dispatch<SetStateAction<boolean>>;
  theme: EventTheme;
  setTheme: Dispatch<SetStateAction<EventTheme>>;
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
  minDate,
  remindersEnabled,
  setRemindersEnabled,
  theme,
  setTheme,
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
                      Voting closes
                    </label>
                    <input
                      id="voteDeadline"
                      type="datetime-local"
                      value={voteDeadline}
                      onChange={(e) => setVoteDeadline(e.target.value)}
                      className={`${FIELD} py-2.5 text-sm`}
                    />
                  </div>
                </div>
              </div>
            )}
            {enablePoll && (
              <div className="mt-3 pl-7 space-y-1.5">
                <label htmlFor="voteDeadline" className="text-sm font-semibold text-ink">
                  Decide by <span className="font-normal text-ink-faint">(optional)</span>
                </label>
                <input
                  id="voteDeadline"
                  type="datetime-local"
                  value={voteDeadline}
                  min={minDate ? `${minDate}T00:00` : undefined}
                  onChange={(e) => setVoteDeadline(e.target.value)}
                  className={`${FIELD} appearance-none [color-scheme:light]`}
                />
                <p className="text-xs text-ink-faint">
                  Voting closes and the winner is picked automatically at this
                  time. Leave blank to decide whenever you’re ready.
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
