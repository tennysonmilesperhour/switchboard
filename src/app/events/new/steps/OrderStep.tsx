'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { WINDOW_CHOICES } from '@/lib/engine/windows';
import type { InviteMode } from '@/lib/types';
import {
  UNIT_FACTORS,
  splitWindow,
  type DraftInvitee,
  type WindowUnit,
} from './wizard-types';

interface OrderStepProps {
  inviteMode: InviteMode;
  invitees: DraftInvitee[];
  commonWindow: number | null;
  setWindowForEveryone: (minutes: number) => void;
  suggested: { windowMinutes: number; label: string };
  move: (index: number, delta: -1 | 1) => void;
  updateInvitee: (index: number, patch: Partial<DraftInvitee>) => void;
  stageCount: number;
}

export function OrderStep({
  inviteMode,
  invitees,
  commonWindow,
  setWindowForEveryone,
  suggested,
  move,
  updateInvitee,
  stageCount,
}: OrderStepProps) {
  return (
        <div className="space-y-4 animate-rise">
          <Card tone="cream">
            <p className="text-sm leading-relaxed text-ink-soft">
              {inviteMode === 'individual' ? (
                <>Order matters: <strong>#1 gets asked first</strong>. If they
                can’t make it, Switchboard quietly moves on. No one ever sees
                their place in line.</>
              ) : inviteMode === 'group' ? (
                <>Assign each person a <strong>wave</strong>. Wave 1 goes out
                immediately; later waves only go out if spots remain.</>
              ) : (
                <>Everyone is invited at the same time, each with a response window.</>
              )}
            </p>
          </Card>
          {/* Set one window for everybody.
              Asked for as "an option set the time to respond for everyone to
              be the same window. Like a select all button or something" — with
              five people that was five identical dropdowns, and the odds of
              getting all five the same by hand fall with every guest added.
              Shown from two people up, since with one there is no "everyone".
              It sits above the list because it is a decision about the whole
              set; the per-person dropdowns stay exactly where they were, so
              giving one person longer is still a normal thing to do. */}
          {invitees.length > 1 && (
            <div className="rounded-card border-2 border-line bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="window-everyone" className="text-sm font-bold">
                  Everyone gets
                </label>
                <select
                  id="window-everyone"
                  value={commonWindow ?? 'mixed'}
                  onChange={(e) => {
                    if (e.target.value === 'mixed') return;
                    setWindowForEveryone(Number(e.target.value));
                  }}
                  className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-terracotta"
                >
                  {/* Only offered while they really are mixed, and never as a
                      destination — picking "Mixed" would have to invent
                      per-person values it has no way to know. */}
                  {commonWindow === null && (
                    <option value="mixed" disabled>
                      Mixed
                    </option>
                  )}
                  {/* A window typed into a custom row is still a shared window
                      once everyone has it, so it has to be selectable here or
                      the control would read "Mixed" for a list that agrees. */}
                  {commonWindow !== null &&
                    !WINDOW_CHOICES.some((c) => c.windowMinutes === commonWindow) && (
                      <option value={commonWindow}>
                        {splitWindow(commonWindow).amount} {splitWindow(commonWindow).unit}
                      </option>
                    )}
                  {WINDOW_CHOICES.map((choice) => (
                    <option key={choice.windowMinutes} value={choice.windowMinutes}>
                      {choice.label} to respond
                    </option>
                  ))}
                </select>
                {commonWindow !== suggested.windowMinutes && (
                  <button
                    type="button"
                    onClick={() => setWindowForEveryone(suggested.windowMinutes)}
                    className="rounded-pill border border-line px-3 py-1.5 text-sm font-semibold text-terracotta transition-colors hover:border-terracotta"
                  >
                    Use suggested ({suggested.label})
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                {commonWindow === null
                  ? 'Right now people have different windows. Pick one to give everybody the same.'
                  : 'Everyone has the same window. You can still change any one person below.'}
              </p>
            </div>
          )}
          <ol className="space-y-2">
            {invitees.map((invitee, index) => (
              <li
                key={invitee.key}
                className="rounded-card border-2 border-line bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  {inviteMode === 'individual' && (
                    <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-terracotta text-sm font-extrabold text-white">
                      {index + 1}
                    </span>
                  )}
                  <Avatar name={invitee.name} seed={invitee.key} size="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="font-bold block truncate">
                      {invitee.name}
                      {!invitee.profileId && (
                        <span className="ml-1.5 text-xs font-semibold text-gold-deep rounded-pill bg-gold-soft px-1.5 py-0.5">guest</span>
                      )}
                    </span>
                  </span>
                  {inviteMode === 'individual' && (
                    <span className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${invitee.name} up`}
                        className="text-ink-faint hover:text-ink disabled:opacity-25 px-1"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === invitees.length - 1}
                        aria-label={`Move ${invitee.name} down`}
                        className="text-ink-faint hover:text-ink disabled:opacity-25 px-1"
                      >
                        ▼
                      </button>
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-2 flex-wrap pl-9">
                  {inviteMode === 'group' && (
                    <select
                      value={invitee.groupStage}
                      onChange={(e) =>
                        updateInvitee(index, { groupStage: Number(e.target.value) })
                      }
                      aria-label={`Wave for ${invitee.name}`}
                      className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-terracotta"
                    >
                      {Array.from({ length: Math.min(stageCount + 1, 5) }, (_, s) => (
                        <option key={s} value={s}>Wave {s + 1}</option>
                      ))}
                    </select>
                  )}
                  {(() => {
                    const isCustom = !WINDOW_CHOICES.some(
                      (c) => c.windowMinutes === invitee.windowMinutes,
                    );
                    const { amount, unit } = splitWindow(invitee.windowMinutes);
                    return (
                      <>
                        <select
                          value={isCustom ? 'custom' : invitee.windowMinutes}
                          onChange={(e) =>
                            updateInvitee(index, {
                              windowMinutes:
                                e.target.value === 'custom'
                                  ? 120
                                  : Number(e.target.value),
                            })
                          }
                          aria-label={`Response window for ${invitee.name}`}
                          className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-terracotta"
                        >
                          {WINDOW_CHOICES.map((choice) => (
                            <option key={choice.windowMinutes} value={choice.windowMinutes}>
                              {choice.label} to respond
                            </option>
                          ))}
                          <option value="custom">Custom…</option>
                        </select>
                        {isCustom && (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              value={amount}
                              onChange={(e) =>
                                updateInvitee(index, {
                                  windowMinutes:
                                    Math.max(1, Math.floor(Number(e.target.value)) || 1) *
                                    UNIT_FACTORS[unit],
                                })
                              }
                              aria-label={`Custom window amount for ${invitee.name}`}
                              className="w-16 rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-terracotta"
                            />
                            <select
                              value={unit}
                              onChange={(e) =>
                                updateInvitee(index, {
                                  windowMinutes:
                                    Math.max(1, amount) *
                                    UNIT_FACTORS[e.target.value as WindowUnit],
                                })
                              }
                              aria-label={`Custom window unit for ${invitee.name}`}
                              className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-terracotta"
                            >
                              <option value="minutes">min</option>
                              <option value="hours">hours</option>
                              <option value="days">days</option>
                            </select>
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-faint">
            💡 Suggested window for this event: <strong>{suggested.label}</strong> -
            based on how soon it starts.
          </p>
        </div>
  );
}
