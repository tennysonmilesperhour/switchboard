'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Card } from '@/components/ui/Card';

interface VisibilityStepProps {
  showInviteList: boolean;
  setShowInviteList: Dispatch<SetStateAction<boolean>>;
  showAccepted: boolean;
  setShowAccepted: Dispatch<SetStateAction<boolean>>;
  showExpired: boolean;
  setShowExpired: Dispatch<SetStateAction<boolean>>;
  remindersEnabled: boolean;
  setRemindersEnabled: Dispatch<SetStateAction<boolean>>;
  parentalApproval: boolean;
  setParentalApproval: Dispatch<SetStateAction<boolean>>;
  capacity: string;
  openTable: boolean;
  setOpenTable: Dispatch<SetStateAction<boolean>>;
}

export function VisibilityStep({
  showInviteList,
  setShowInviteList,
  showAccepted,
  setShowAccepted,
  showExpired,
  setShowExpired,
  remindersEnabled,
  setRemindersEnabled,
  parentalApproval,
  setParentalApproval,
  capacity,
  openTable,
  setOpenTable,
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
                label: 'Keep expired invitations visible',
                hint: 'People whose window passed can still see the event page.',
                value: showExpired,
                set: setShowExpired,
              },
              {
                label: 'Send reminder nudges',
                hint: 'Switchboard can nudge invited people before the plan starts.',
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
                  <span className="font-bold">Open Table 🍽️</span>
                  <span className="block text-sm text-ink-soft mt-0.5">
                    If seats stay empty, friends of your attendees can ask to
                    join. You approve every request.
                  </span>
                </span>
              </label>
            </Card>
          )}
          <p className="text-xs text-ink-faint leading-relaxed px-1">
            Defaults are tuned so a one-on-one coffee feels private and a party
            feels social. Invitees never see their position in the cascade.
          </p>
        </div>
  );
}
