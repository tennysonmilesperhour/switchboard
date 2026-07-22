import { describe, expect, test } from 'vitest';
import { directInvitePath } from './invite-links';

describe('directInvitePath', () => {
  test('uses the token route for registered and guest invite delivery', () => {
    expect(directInvitePath('event-id', 'invite-token')).toBe('/rsvp/invite-token');
  });

  test('keeps old rows without a token reachable through the event route', () => {
    expect(directInvitePath('legacy-event', null)).toBe('/events/legacy-event');
  });
});
