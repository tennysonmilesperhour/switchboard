import { describe, expect, it } from 'vitest';
import { runItBackCrew, type PriorInvite } from './run-it-back';

const row = (patch: Partial<PriorInvite>): PriorInvite => ({
  invitee_id: null,
  guest_name: null,
  guest_contact: null,
  status: 'accepted',
  decline_note: null,
  ...patch,
});

describe('runItBackCrew', () => {
  it('keeps everyone who was crew, whatever they answered last time', () => {
    const prior = [
      row({ invitee_id: 'a', status: 'accepted' }),
      row({ invitee_id: 'b', status: 'declined', decline_note: 'keep_asking' }),
      row({ invitee_id: 'c', status: 'expired' }),
      row({ guest_name: 'Sam', guest_contact: 'sam@example.com', status: 'cancelled' }),
    ];
    expect(runItBackCrew(prior, 'host')).toHaveLength(4);
  });

  it('drops anyone who said it was not their thing', () => {
    const prior = [row({ invitee_id: 'a', status: 'declined', decline_note: 'not_my_thing' })];
    expect(runItBackCrew(prior, 'host')).toEqual([]);
  });

  it('never turns an unapproved join request into an invitation', () => {
    expect(runItBackCrew([row({ invitee_id: 'stranger', status: 'requested' })], 'host')).toEqual([]);
  });

  it('never invites the host to their own plan', () => {
    expect(runItBackCrew([row({ invitee_id: 'host' })], 'host')).toEqual([]);
  });

  it('carries each person once', () => {
    const prior = [
      row({ invitee_id: 'a', status: 'declined' }),
      row({ invitee_id: 'a', status: 'accepted' }),
      row({ guest_contact: 'Sam@Example.com' }),
      row({ guest_contact: 'sam@example.com' }),
    ];
    expect(runItBackCrew(prior, 'host')).toHaveLength(2);
  });
});
