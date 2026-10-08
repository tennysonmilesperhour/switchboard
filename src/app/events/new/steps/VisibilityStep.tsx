'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Card } from '@/components/ui/Card';
import { REMINDER_SCHEDULE_COPY } from '@/lib/plan-extras';

interface VisibilityStepProps {
  showInviteList: boolean;
  setShowInviteList: Dispatch<SetStateAction<boolean>>;
  showAccepted: boolean;
  setShowAccepted: Dispatch<SetStateAction<boolean>>;
  /**
   * @deprecated Retired by decision D3: nothing ever read `show_expired`, so
   * this step no longer offers it. Still accepted so the wizard compiles
   * unchanged; it is ignored.
   */
  showExpired?: boolean;
  /** @deprecated See `showExpired`. Ignored. */
  setShowExpired?: Dispatch<SetStateAction<boolean>>;
  remindersEnabled: boolean;
  setRemindersEnabled: Dispatch<SetStateAction<boolean>>;
  parentalApproval: boolean;
  setParentalApproval: Dispatch<SetStateAction<boolean>>;
  capacity: string;
  openTable: boolean;
  setOpenTable: Dispatch<SetStateAction<boolean>>;
  broadcastNearby: boolean;
  setBroadcastNearby: Dispatch<SetStateAction<boolean>>;
}

export function VisibilityStep({
  showInviteList,
  setShowInviteList,
  showAccepted,
  setShowAccepted,
  remindersEnabled,
  setRemindersEnabled,
  parentalApproval,
  setParentalApproval,
  capacity,
  openTable,
  setOpenTable,
  broadcastNearby,
  setBroadcastNearby,
}: VisibilityStepProps) {
  return (
        <div className="space-y-3 animate-rise">
          {(
            [
              {
                label: 'Show the invite list',
                hint: 'Attendees can see everyone who was invited.',
                value: showInviteList,
                set: setShowInviteList,
              },
              {
                label: 'Show who’s accepted',
                hint: 'Attendees can see who’s already in.',
                value: showAccepted,
                set: setShowAccepted,
              },
              {
                label: 'Send reminder nudges',
                hint: REMINDER_SCHEDULE_COPY,
                value: remindersEnabled,
                set: setRemindersEnabled,
              },
              {
                label: 'Require parental approval',
                hint: "Every RSVP needs a parent or guardian's approval before it counts.",
                value: parentalApproval,
                set: setParentalApproval,
              },
            ] as const
          ).map((option) => (
            <Card key={option.label}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={option.value}
                  onChange={(e) => option.set(e.target.checked)}
                  className="mt-1 size-4 accent-terracotta"
                />
                <span>
                  <span className="font-bold">{option.label}</span>
                  <span className="block text-sm text-ink-soft mt-0.5">{option.hint}</span>
                </span>
              </label>
            </Card>
          ))}
          {capacity && Number(capacity) > 1 && (
            <Card tone="gold">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openTable}
                  onChange={(e) => setOpenTable(e.target.checked)}
                  className="mt-1 size-4 accent-terracotta"
                />
                <span>
                  <span className="font-bold">Open Table</span>
                  <span className="block text-sm text-ink-soft mt-0.5">
                    If seats stay empty, friends of your attendees can ask to
                    join. You approve every request.
                  </span>
                </span>
              </label>
              {openTable && (
                <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-line pt-3">
                  <input
                    type="checkbox"
                    checked={broadcastNearby}
                    onChange={(e) => setBroadcastNearby(e.target.checked)}
                    className="mt-1 size-4 accent-terracotta"
                  />
                  <span>
                    <span className="font-bold">Show it to people nearby</span>
                    <span className="block text-sm text-ink-soft mt-0.5">
                      People in your range, strangers included, see the title,
                      day and open seats in Explore. They never see the place.
                      Needs your city set in Edit profile.
                    </span>
                  </span>
                </label>
              )}
            </Card>
          )}
          <p className="text-plate text-plate-inset text-xs text-ink-faint leading-relaxed px-1">
            Defaults are tuned so a one-on-one coffee feels private and a party
            feels social. Invitees never see their place in the invite order.
          </p>
        </div>
  );
}
