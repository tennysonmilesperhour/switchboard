import { describe, expect, it } from 'vitest';
import { cohostCandidates, hostGuardianQueue, inviteListPeople } from './event-people';

describe('inviteListPeople', () => {
  it('carries identity only — never a contact, a link, or a message', () => {
    const [person] = inviteListPeople([
      {
        invite_id: 'invite-1',
        invitee_id: 'user-1',
        display_name: 'Robin',
        handle: 'robin',
        avatar_url: null,
        status: 'accepted',
      },
    ]);
    expect(person).toMatchObject({
      id: 'invite-1',
      name: 'Robin',
      handle: 'robin',
      statusLabel: 'Going',
      contact: null,
      inviteUrl: null,
      messages: null,
    });
  });

  it('labels anything the database did not name as simply invited', () => {
    const people = inviteListPeople([
      { invite_id: 'a', invitee_id: null, display_name: 'Guest', handle: null, avatar_url: null, status: 'invited' },
      { invite_id: 'b', invitee_id: 'u', display_name: ' ', handle: null, avatar_url: null, status: 'waitlisted' },
    ]);
    expect(people.map((person) => [person.name, person.statusLabel, person.isGuest])).toEqual([
      ['Guest', 'Invited', true],
      ['Guest', 'Waitlisted', false],
    ]);
  });
});

describe('cohostCandidates (decision D1)', () => {
  it('offers invitees with accounts and the host’s connections, once each', () => {
    const picks = cohostCandidates({
      invites: [
        { invitee_id: 'guest', invitee_name: 'Guest', invitee_handle: 'guest', status: 'sent' },
        { invitee_id: 'asker', invitee_name: 'Asker', invitee_handle: 'asker', status: 'requested' },
        { invitee_id: null, invitee_name: 'Off-app', invitee_handle: null, status: 'sent' },
        { invitee_id: 'already', invitee_name: 'Already', invitee_handle: 'already', status: 'accepted' },
      ],
      connections: [
        { id: 'friend', name: 'Friend', handle: 'friend' },
        { id: 'guest', name: 'Guest', handle: 'guest' },
      ],
      cohostIds: ['already'],
      hostId: 'host',
    });
    expect(picks.map((person) => person.id)).toEqual(['guest', 'friend']);
  });
});

describe('hostGuardianQueue', () => {
  it('lists every held yes, including one where nobody has been asked yet', () => {
    const queue = hostGuardianQueue(
      [
        { id: 'asked', status: 'pending_approval', invitee_name: 'Avery' },
        { id: 'not-asked', status: 'pending_approval', invitee_name: 'Blake' },
        { id: 'legacy', status: 'accepted', invitee_name: 'Casey' },
        { id: 'in', status: 'accepted', invitee_name: 'Drew' },
      ],
      [
        { invite_id: 'asked', guardian_email: 'a@example.com', guardian_name: null, email_status: 'failed' },
        { invite_id: 'legacy', guardian_email: 'c@example.com', guardian_name: 'Pat', email_status: null },
      ],
    );
    expect(queue).toEqual([
      { inviteId: 'asked', inviteeName: 'Avery', guardianEmail: 'a@example.com', guardianName: null, emailStatus: 'failed' },
      { inviteId: 'not-asked', inviteeName: 'Blake', guardianEmail: null, guardianName: null, emailStatus: null },
      { inviteId: 'legacy', inviteeName: 'Casey', guardianEmail: 'c@example.com', guardianName: 'Pat', emailStatus: null },
    ]);
  });
});
