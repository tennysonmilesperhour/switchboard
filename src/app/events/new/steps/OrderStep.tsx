'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { ReorderableList } from '@/components/ui/ReorderableList';
import { WINDOW_CHOICES } from '@/lib/engine/windows';
import { orderMatters, rhythmLine, wavesOffered } from '@/lib/invite-rhythm';
import { ResponseWindowPicker } from './ResponseWindowPicker';
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
  /** Drag, or the arrow keys on a row's grip. */
  moveInvitee: (from: number, to: number) => void;
  /** Take somebody off the plan from here. */
  removeInvitee: (key: string) => void;
  updateInvitee: (index: number, patch: Partial<DraftInvitee>) => void;
}

export function OrderStep({
  inviteMode,
  invitees,
  commonWindow,
  setWindowForEveryone,
  suggested,
  moveInvitee,
  removeInvitee,
  updateInvitee,
}: OrderStepProps) {
  // Waves are assigned by the dropdown on each row, so dragging rows around
  // would move a number that nothing reads. `orderMatters` is the one place
  // that knows which modes those are.
  const ordered = orderMatters(inviteMode);
  // The waves this plan has plus the one after the last, from the same rule the
  // plan page and `set_invite_stage` use - so a wave offered here is a wave the
  // running plan will still accept.
  const waveChoices = wavesOffered(invitees.map((invitee) => invitee.groupStage));
  return (
        <div className="space-y-4 animate-rise">
          <Card tone="cream">
            <p className="text-sm leading-relaxed text-ink-soft">
              {rhythmLine(inviteMode, invitees.length)}
            </p>
            {ordered && (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Drag anyone by the handle to move them, and no one ever sees
                their place in line.
              </p>
            )}
          </Card>
          {/* Shown from two people up, since with one there is no "everyone".
              It sits above the list because it is a decision about the whole
              set; the per-person dropdowns stay exactly where they were, so
              giving one person longer is still a normal thing to do. */}
          {invitees.length > 1 && (
            <ResponseWindowPicker
              label="Everyone gets"
              commonWindow={commonWindow}
              setWindowForEveryone={setWindowForEveryone}
              suggested={suggested}
            />
          )}
          <ReorderableList
            aria-label="Invitees, in order"
            items={invitees.map((invitee) => ({ ...invitee, label: invitee.name }))}
            onReorder={ordered ? moveInvitee : undefined}
            onRemove={(item) => removeInvitee(item.key)}
            removeLabel={(item) => `Take ${item.name} off this plan`}
            rowClassName="bg-card border-2 border-line"
          >
            {(invitee, index) => (
              <>
                <div className="flex items-center gap-3">
                  {ordered && (
                    <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-terracotta text-sm font-extrabold text-white">
                      {index + 1}
                    </span>
                  )}
                  <Avatar name={invitee.name} seed={invitee.key} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {invitee.name}
                      {!invitee.profileId && (
                        <span className="ml-1.5 rounded-pill bg-gold-soft px-1.5 py-0.5 text-xs font-semibold text-gold-deep">guest</span>
                      )}
                    </span>
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {inviteMode === 'group' && (
                    <select
                      value={invitee.groupStage}
                      onChange={(e) =>
                        updateInvitee(index, { groupStage: Number(e.target.value) })
                      }
                      aria-label={`Wave for ${invitee.name}`}
                      className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-terracotta"
                    >
                      {waveChoices.map((stage) => (
                        <option key={stage} value={stage}>Wave {stage + 1}</option>
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
              </>
            )}
          </ReorderableList>
          <p className="text-plate text-plate-inset inline-block text-xs text-ink-faint">
            💡 Suggested window for this plan: <strong>{suggested.label}</strong> -
            based on how soon it starts.
          </p>
        </div>
  );
}
