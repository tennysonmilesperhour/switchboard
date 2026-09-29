import { describe, expect, it } from 'vitest';
import { invitationStep, readyToSendInvitations } from './poll-readiness';

/**
 * The rule that enables "Send the invitations" and that `startInviting`
 * enforces: the group has finished answering AND the plan has a date. The page
 * passes the polls' half to HostControls, which combines it with `starts_at`;
 * the server makes the same two calls.
 */
describe('readyToSendInvitations (the polls’ half)', () => {
  const phases = (...list: string[]) => list.map((phase) => ({ phase }));

  it('is settled once every poll is decided', () => {
    expect(readyToSendInvitations(phases('decided'))).toBe(true);
    expect(readyToSendInvitations(phases('decided', 'decided'))).toBe(true);
  });

  it.each(['suggesting', 'voting', 'runoff'])('waits while a poll is %s', (open) => {
    expect(readyToSendInvitations(phases('decided', open))).toBe(false);
    expect(readyToSendInvitations(phases(open))).toBe(false);
  });

  it('does not wait on a follow-up that has not opened yet', () => {
    expect(readyToSendInvitations(phases('decided', 'pending'))).toBe(true);
  });

  it('does not wait forever on a plan with no open poll', () => {
    // With nothing left to answer, the only remaining question is the date —
    // and that one the host can always settle. Holding the button back here
    // left a plan with no way forward at all.
    expect(readyToSendInvitations([])).toBe(true);
    expect(readyToSendInvitations(phases('pending'))).toBe(true);
  });
});

describe('invitationStep (the whole rule)', () => {
  const DATE = '2026-10-02T01:00:00.000Z';

  it('waits for the group while anything is open, date or no date', () => {
    expect(invitationStep(false, null)).toBe('deciding');
    expect(invitationStep(false, DATE)).toBe('deciding');
  });

  it('is ready once the group is done and the plan has a date', () => {
    expect(invitationStep(true, DATE)).toBe('ready');
    // PostgREST's spelling of the same instant.
    expect(invitationStep(true, '2026-10-02T01:00:00+00:00')).toBe('ready');
  });

  it('asks for a date when a decided poll left the plan without one', () => {
    // A free-text idea won, nothing won, or a poll closed with no ideas at
    // all: "The date is set" must not go out for a plan still reading
    // "Time TBD". The host gets "Set the date" instead of a dead button.
    expect(invitationStep(true, null)).toBe('needs-date');
    expect(invitationStep(true, undefined)).toBe('needs-date');
    expect(invitationStep(true, '')).toBe('needs-date');
    expect(invitationStep(true, 'not a date')).toBe('needs-date');
  });

  it('composes the same way on both surfaces', () => {
    const polls = [{ phase: 'decided' }, { phase: 'pending' }];
    expect(invitationStep(readyToSendInvitations(polls), null)).toBe('needs-date');
    expect(invitationStep(readyToSendInvitations(polls), DATE)).toBe('ready');
    expect(invitationStep(readyToSendInvitations([{ phase: 'voting' }]), DATE)).toBe('deciding');
  });
});
