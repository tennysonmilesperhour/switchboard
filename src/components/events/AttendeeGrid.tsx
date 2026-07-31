'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import {
  InviteeSheet,
  inviteeIsTappable,
  type InviteePerson,
} from '@/components/events/InviteeSheet';

/**
 * "Who's in", made tappable.
 *
 * The same card the invitation flow opens, so the gesture means one thing
 * everywhere on a plan: tap a face, get that person. What the card can do
 * depends on what the server put in the props — a host sees the contact and the
 * prefilled message, anyone else sees the profile.
 */
export function AttendeeGrid({ people }: { people: InviteePerson[] }) {
  const [openPerson, setOpenPerson] = useState<InviteePerson | null>(null);

  return (
    <div className="flex flex-wrap gap-3">
      {people.map((person) => {
        const firstName = person.name.split(' ')[0];
        const inner = (
          <>
            <Avatar
              name={person.name}
              seed={person.seed}
              src={person.avatarUrl}
              size="md"
              ring
            />
            <span className="w-full truncate text-center text-xs font-semibold text-ink-soft">
              {firstName}
            </span>
          </>
        );
        return inviteeIsTappable(person) ? (
          <button
            key={person.id}
            type="button"
            onClick={() => setOpenPerson(person)}
            aria-label={`Open ${person.name}’s card`}
            className="flex w-16 flex-col items-center gap-1 rounded-card transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            {inner}
          </button>
        ) : (
          <div key={person.id} className="flex w-16 flex-col items-center gap-1">
            {inner}
          </div>
        );
      })}
      {openPerson && (
        <InviteeSheet person={openPerson} onClose={() => setOpenPerson(null)} />
      )}
    </div>
  );
}
