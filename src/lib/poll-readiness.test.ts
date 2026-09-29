import { describe, expect, it } from 'vitest';
import { readyToSendInvitations } from './poll-readiness';

/**
 * The rule that enables "Send the invitations" and that `startInviting`
 * enforces. It must match what the plan page used to show inline: the poll it
 * leads with is the first one still open, else the latest decided one, and the
 * button is live only when that poll is decided.
 */
describe('readyToSendInvitations', () => {
  const phases = (...list: string[]) => list.map((phase) => ({ phase }));

  it('is ready once every poll is decided', () => {
    expect(readyToSendInvitations(phases('decided'))).toBe(true);
    expect(readyToSendInvitations(phases('decided', 'decided'))).toBe(true);
  });

  it.each(['suggesting', 'voting', 'runoff'])('waits while a poll is %s', (open) => {
    expect(readyToSendInvitations(phases('decided', open))).toBe(false);
  });

  it('does not wait on a follow-up that has not opened yet', () => {
    expect(readyToSendInvitations(phases('decided', 'pending'))).toBe(true);
  });

  it('is not ready with nothing decided', () => {
    expect(readyToSendInvitations([])).toBe(false);
    expect(readyToSendInvitations(phases('pending'))).toBe(false);
  });
});
