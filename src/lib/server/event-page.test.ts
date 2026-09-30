import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THREAD_PREVIEW_COUNT } from '@/lib/engine/thread';
import {
  COHOST,
  FRIEND,
  HELD,
  HOST,
  NO,
  PLAN_ID,
  PRIVATE_STRINGS,
  QUEUED,
  SENT,
  STRANGER,
  YES,
  asUser,
  clients,
  db,
  failTable,
  hidePlanFromViewer,
  queriesOn,
  restoreDefaults,
  rpcCallsTo,
  seedPlan,
} from './event-page.fake';

/**
 * The plan page loader, by who is looking: which parts each viewer may load,
 * and what those parts carry. The database fake applies the loader's own
 * filters and column lists, so "a guest never receives a contact" follows from
 * the queries the loader builds, not from what the fixture happens to hold.
 * Polls, the calendar, zones, answers and the thread are in
 * `event-page-plan.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  getRelationship: vi.fn(),
  getMutualConnections: vi.fn(),
  loadAvailability: vi.fn(),
  signMediaRef: vi.fn(),
}));

vi.mock('@/lib/supabase/server', async () => {
  const fake = await import('./event-page.fake');
  return { createClient: async () => fake.session };
});
vi.mock('@/lib/supabase/admin', async () => {
  const fake = await import('./event-page.fake');
  return { createAdminClient: fake.clients.createAdminClient };
});
vi.mock('@/lib/server/relationship', () => ({
  getRelationship: mocks.getRelationship,
  getMutualConnections: mocks.getMutualConnections,
}));
vi.mock('@/lib/actions/availability', () => ({ loadAvailability: mocks.loadAvailability }));
vi.mock('@/lib/server/media', () => ({ signMediaRef: mocks.signMediaRef }));

import { EVENT_PAGE_UNAVAILABLE, loadEventPage } from './event-page';

async function load(viewer: string) {
  const page = await loadEventPage(PLAN_ID, asUser(viewer));
  if (!page || page === EVENT_PAGE_UNAVAILABLE) throw new Error(`expected ${viewer} to load the plan`);
  return page;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://switchboard.test');
  restoreDefaults();
  seedPlan();
  mocks.getRelationship.mockReset().mockResolvedValue({ status: 'connected' });
  mocks.getMutualConnections.mockReset().mockResolvedValue([{ id: 'u-mutual', display_name: 'Mo' }]);
  mocks.loadAvailability.mockReset().mockResolvedValue({ counts: [], responders: 0, eligiblePeople: 4 });
  mocks.signMediaRef.mockReset().mockImplementation(async (ref: string | null) => (ref ? `https://media.test/${ref}` : null));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('who loads the plan at all', () => {
  it('gives a viewer RLS does not show the plan to nothing, before any service-role read', async () => {
    hidePlanFromViewer();

    await expect(loadEventPage(PLAN_ID, asUser(STRANGER))).resolves.toBeNull();

    // An arbitrary id in the URL must not buy service-role work.
    expect(clients.createAdminClient).not.toHaveBeenCalled();
    expect(db.queries.map((query) => `${query.client}:${query.table}`)).toEqual(['session:events']);
    expect(mocks.getRelationship).not.toHaveBeenCalled();
    expect(mocks.loadAvailability).not.toHaveBeenCalled();
  });

  it('tells a failed read apart from a plan the viewer cannot see', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    failTable('session', 'events', { code: '57014', message: 'canceling statement due to statement timeout' });

    // Not null: null sends the viewer to /join, which told a host they had lost
    // their own plan whenever the database was slow.
    await expect(loadEventPage(PLAN_ID, asUser(HOST))).resolves.toBe(EVENT_PAGE_UNAVAILABLE);
    expect(clients.createAdminClient).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(' ')).toContain('SB-PLAN-OPEN');
    logged.mockRestore();
  });

  it('reads the plan through the viewer’s own session, so RLS is the preflight', async () => {
    await load(YES);

    expect(queriesOn('admin', 'events')).toEqual([]);
    expect(queriesOn('session', 'events')).toEqual([
      expect.objectContaining({ filters: [['eq', 'id', PLAN_ID]] }),
    ]);
  });

  it('sends a viewer who gets nothing on to the share-link page, and a failed read to a coded notice', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/events/[id]/page.tsx'), 'utf8');

    // The failed read is handled first, so it can never fall through to /join.
    expect(page).toMatch(
      /const loaded = await loadEventPage\(id, user\);\s*if \(loaded === EVENT_PAGE_UNAVAILABLE\) \{[\s\S]*?code="SB-PLAN-OPEN"[\s\S]*?\}\s*(?:\/\/[^\n]*\n\s*)*if \(!loaded\) redirect\(`\/join\/\$\{id\}`\);/,
    );
  });
});

describe('the primary host', () => {
  it('gets the whole guest list, in order, with each invitation’s latest delivery per channel', async () => {
    const page = await load(HOST);

    expect(page).toMatchObject({ isHost: true, canManage: true, myInvite: null, guardianStep: null, hostCard: null });
    expect(page.hostInvites.map((invite) => invite.id)).toEqual([
      'inv-yes', 'inv-held', 'inv-sent', 'inv-no', 'inv-queued', 'inv-cohost', 'inv-sam', 'inv-ada',
    ]);
    const byId = Object.fromEntries(page.hostInvites.map((invite) => [invite.id, invite]));
    expect(byId['inv-sent']).toMatchObject({
      invitee_name: 'Sam',
      invitee_handle: 'sam.b',
      deliveries: [
        { channel: 'email', status: 'sent' },
        { channel: 'in_app', status: 'sent' },
      ],
    });
    // An SMS job's newest status is the SMS channel's word.
    expect(byId['inv-sam']).toMatchObject({ invitee_name: 'Sam', invitee_handle: null, deliveries: [{ channel: 'sms', status: 'delivered' }] });
    expect(queriesOn('admin', 'sms_jobs')[0].filters).toEqual([
      ['in', 'invite_id', page.hostInvites.map((invite) => invite.id)],
    ]);
    // Their own plan: no relationship card to compute.
    expect(mocks.getRelationship).not.toHaveBeenCalled();
    expect(mocks.getMutualConnections).not.toHaveBeenCalled();
  });

  it('gets the co-host roster, one-tap candidates, and connections not yet invited', async () => {
    const page = await load(HOST);

    expect(page.cohosts).toEqual([{ id: COHOST, name: 'Cora' }]);
    expect(page.addableConnections).toEqual([
      { id: FRIEND, name: 'Fern', handle: 'fern', avatarUrl: 'fern.png', sabbatical: { note: 'Back in May' } },
    ]);
    expect(queriesOn('session', 'connections')[0].filters).toEqual([
      ['eq', 'status', 'accepted'],
      ['or', '', `requester_id.eq.${HOST},addressee_id.eq.${HOST}`],
    ]);
    // Guests with accounts (not the co-host already made one), then connections.
    expect(page.cohostCandidates.map((person) => person.id)).toEqual([YES, HELD, SENT, NO, QUEUED, FRIEND]);
  });

  it('offers no connections to add once the guest list is locked', async () => {
    seedPlan({ status: 'confirmed' });

    const page = await load(HOST);

    expect(queriesOn('session', 'connections')).toEqual([]);
    expect(page.addableConnections).toEqual([]);
  });
});

describe('a co-host', () => {
  it('runs the guest list like the host, but not the roster or the RSVP answers', async () => {
    const page = await load(COHOST);

    expect(page).toMatchObject({ isHost: false, canManage: true, guardianStep: null });
    expect(page.hostInvites).toHaveLength(8);
    expect(page.cohosts).toEqual([]);
    expect(page.cohostCandidates).toEqual([]);
    expect(page.answersByGuest).toEqual([]);
    expect(queriesOn('admin', 'invite_answers')).toEqual([]);
    expect(page.hostCard).toEqual({
      host: expect.objectContaining({ id: HOST, display_name: 'Hana' }),
      relationship: { status: 'connected' },
      mutuals: [{ id: 'u-mutual', display_name: 'Mo' }],
    });
  });

  it('is never shown as a guest on the plan they help run, even holding an invitation', async () => {
    const page = await load(COHOST);

    expect(page.myInvite).toBeNull();
    expect(page.canAccessThread).toBe(true);
    expect(rpcCallsTo('event_invite_list')).toEqual([]);
  });
});

describe('an invitee', () => {
  it('who said yes sees the plan, the whole thread and their Give Space notice — none of the host’s reads run', async () => {
    const page = await load(YES);

    expect(page).toMatchObject({ isHost: false, canManage: false, canAccessThread: true, giveSpaceNotice: true });
    expect(page.myInvite).toMatchObject({ id: 'inv-yes', status: 'accepted' });
    expect(page.threadGateInfo).toMatchObject({ unlocked: true, visibleCount: 3, hiddenCount: 0 });
    expect(queriesOn('admin', 'event_comments')[0].limit).toBeNull();
    expect(page.hostCard).toMatchObject({ host: { id: HOST }, relationship: { status: 'connected' } });
    expect(mocks.getRelationship).toHaveBeenCalledWith(expect.anything(), YES, HOST);
    for (const empty of [page.hostInvites, page.guestLinks, page.addableConnections, page.cohosts, page.cohostCandidates, page.pendingParentalApprovals, page.answersByGuest]) {
      expect(empty).toEqual([]);
    }
    expect(page.inviteeCards).toEqual({});
    expect(queriesOn('admin', 'invites').some((query) => query.columns.includes('delivery_attempts'))).toBe(false);
    expect(queriesOn('admin', 'sms_jobs')).toEqual([]);
    expect(queriesOn('session', 'connections')).toEqual([]);
    expect(queriesOn('admin', 'invite_answers')).toEqual([]);
    // Their own guardian requests only, never the plan's.
    expect(queriesOn('admin', 'parental_approvals').map((query) => query.filters)).toEqual([
      [['eq', 'event_id', PLAN_ID], ['eq', 'invite_id', 'inv-yes']],
    ]);
  });

  it('who has not answered gets a preview of the thread, not the thread', async () => {
    const page = await load(SENT);

    expect(page.myInvite).toMatchObject({ status: 'sent' });
    expect(page.canAccessThread).toBe(false);
    expect(queriesOn('admin', 'event_comments')[0].limit).toBe(THREAD_PREVIEW_COUNT);
    expect(page.threadComments.map((comment) => comment.id)).toEqual(['c-1', 'c-2']);
    expect(page.threadTotal).toBe(3);
    expect(page.threadGateInfo).toMatchObject({ unlocked: false, visibleCount: 2, hiddenCount: 1 });
    expect(page.giveSpaceNotice).toBe(false);
  });

  it('who a guardian turned down is told whose no it was', async () => {
    const page = await load(NO);

    expect(page.canAccessThread).toBe(false);
    expect(page.guardianStep).toEqual({
      request: { status: 'denied', sentTo: 'n•••@example.com', requestedAt: '2026-09-19T00:00:00Z', emailStatus: 'sent' },
    });
  });
});

describe('contact details (docs/SECURITY.md, “Contact details on a plan”)', () => {
  beforeEach(() => {
    seedPlan({ show_accepted: true, show_invite_list: true });
    db.rpc.event_invite_list = () => [
      { invite_id: 'inv-yes', invitee_id: YES, display_name: 'Yara', handle: 'yara', avatar_url: null, status: 'accepted' },
      { invite_id: 'inv-ada', invitee_id: null, display_name: 'Guest', handle: null, avatar_url: null, status: 'accepted' },
    ];
  });

  it.each([YES, HELD, SENT, NO])('never hands guest %s a guest’s address, an RSVP token, or a guardian’s address', async (viewer) => {
    const page = await load(viewer);

    const shipped = JSON.stringify(page);
    for (const secret of PRIVATE_STRINGS) expect(shipped).not.toContain(secret);
    expect(page.attendees.length).toBeGreaterThan(0);
    for (const attendee of page.attendees) {
      expect(attendee).toMatchObject({ guestContact: null, guestToken: null });
    }
    for (const card of [...page.attendeeCards, ...page.inviteList]) {
      expect(card).toMatchObject({ contact: null, inviteUrl: null, messages: null });
    }
  });

  it('shows a guest added by email as “Guest” to the other guests', async () => {
    const page = await load(YES);

    expect(page.attendees.find((attendee) => attendee.inviteId === 'inv-ada')).toMatchObject({ name: 'Guest' });
    expect(page.attendeeCards.find((card) => card.id === 'inv-ada')).toMatchObject({ name: 'Guest', isGuest: true });
  });

  it('gives the host and co-hosts each guest’s address and the right link to send', async () => {
    for (const viewer of [HOST, COHOST]) {
      const page = await load(viewer);

      // An unanswered guest gets their own RSVP link; everyone else the plan's.
      expect(page.inviteeCards['inv-sam']).toMatchObject({
        contact: 'sam@example.com',
        inviteUrl: 'https://switchboard.test/rsvp/tok-sam',
        messages: { plan: expect.anything(), app: expect.anything() },
      });
      expect(page.inviteeCards['inv-sent']).toMatchObject({ contact: null, inviteUrl: 'https://switchboard.test/i/share-tok' });
      expect(page.inviteeCards['inv-ada']).toMatchObject({ contact: 'ada@example.com', inviteUrl: 'https://switchboard.test/i/share-tok' });
      expect(page.attendees.find((attendee) => attendee.inviteId === 'inv-ada')).toMatchObject({
        name: 'ada@example.com',
        guestContact: 'ada@example.com',
        guestToken: 'tok-ada',
      });
      // Only a guest still waiting has a personal link to hand over.
      expect(page.guestLinks).toEqual([{ name: 'Sam', contact: 'sam@example.com', url: 'https://switchboard.test/rsvp/tok-sam' }]);
    }
  });

  it('offers the host no plan link for a link they switched off', async () => {
    seedPlan({ share_link_active: false });

    const page = await load(HOST);

    expect(page.inviteeCards['inv-sent']).toMatchObject({ inviteUrl: null });
    // A guest's own RSVP link is theirs, not the plan's, and still works.
    expect(page.inviteeCards['inv-sam']).toMatchObject({ inviteUrl: 'https://switchboard.test/rsvp/tok-sam' });
  });
});

describe('the invite list (decision D3)', () => {
  it('is not asked for while the host keeps it hidden', async () => {
    seedPlan({ show_invite_list: false });

    const page = await load(YES);

    expect(rpcCallsTo('event_invite_list')).toEqual([]);
    expect(page.inviteList).toEqual([]);
  });

  it('comes from the definer function, read as the viewer, carrying identity alone', async () => {
    seedPlan({ show_invite_list: true });
    db.rpc.event_invite_list = () => [
      { invite_id: 'inv-yes', invitee_id: YES, display_name: 'Yara', handle: 'yara', avatar_url: 'yara.png', status: 'accepted' },
      { invite_id: 'inv-sam', invitee_id: null, display_name: '  ', handle: null, avatar_url: null, status: 'invited' },
    ];

    const page = await load(SENT);

    expect(rpcCallsTo('event_invite_list')).toEqual([{ client: 'session', name: 'event_invite_list', args: { p_event: PLAN_ID } }]);
    expect(page.inviteList).toEqual([
      { id: 'inv-yes', name: 'Yara', handle: 'yara', avatarUrl: 'yara.png', seed: YES, isGuest: false, statusLabel: 'Going', contact: null, inviteUrl: null, messages: null },
      { id: 'inv-sam', name: 'Guest', handle: null, avatarUrl: null, seed: 'inv-sam', isGuest: true, statusLabel: 'Invited', contact: null, inviteUrl: null, messages: null },
    ]);
  });

  it('shows no status the function withheld: with “show who’s in” off, everyone reads as invited', async () => {
    // `event_invite_list` masks statuses unless show_accepted is on (pgTAP:
    // invite_list_visibility.test.sql); the loader must not re-derive them.
    seedPlan({ show_invite_list: true, show_accepted: false });
    db.rpc.event_invite_list = () => [
      { invite_id: 'inv-yes', invitee_id: YES, display_name: 'Yara', handle: 'yara', avatar_url: null, status: 'invited' },
      { invite_id: 'inv-held', invitee_id: HELD, display_name: 'Hal', handle: 'hal', avatar_url: null, status: 'invited' },
    ];

    const page = await load(SENT);

    expect(page.inviteList.map((person) => person.statusLabel)).toEqual(['Invited', 'Invited']);
    expect(page.attendees).toEqual([]);
  });
});

describe('who counts as going (a guardian-held yes does not)', () => {
  it('counts only real yeses for the host, and queues the held one for recovery', async () => {
    const page = await load(HOST);

    expect(page.attendees.map((attendee) => attendee.inviteId)).toEqual(['inv-yes', 'inv-cohost', 'inv-ada']);
    expect(page.acceptedCount).toBe(3);
    expect(page.pendingParentalApprovals).toEqual([
      { inviteId: 'inv-held', inviteeName: 'Hal', guardianEmail: 'parent@example.com', guardianName: 'Pat', emailStatus: 'sent' },
    ]);
    expect(queriesOn('admin', 'parental_approvals')[0].filters).toEqual([
      ['eq', 'event_id', PLAN_ID],
      ['eq', 'status', 'pending'],
    ]);
  });

  it('shows guests only accepted invitations when the host shows who’s in', async () => {
    seedPlan({ show_accepted: true });

    const page = await load(SENT);

    expect(queriesOn('admin', 'invites')[0].filters).toEqual([
      ['eq', 'event_id', PLAN_ID],
      ['eq', 'status', 'accepted'],
    ]);
    expect(page.attendees.map((attendee) => attendee.inviteId).sort()).toEqual(['inv-ada', 'inv-cohost', 'inv-yes']);
    expect(page.acceptedCount).toBe(3);
  });

  it('gives guests a count alone, of accepted invitations, when the host hides who’s in', async () => {
    seedPlan({ show_accepted: false });

    const page = await load(SENT);

    expect(page.attendees).toEqual([]);
    expect(page.attendeeCards).toEqual([]);
    expect(queriesOn('admin', 'invites')).toEqual([
      expect.objectContaining({ columns: 'id', head: true, filters: [['eq', 'event_id', PLAN_ID], ['eq', 'status', 'accepted']] }),
    ]);
    expect(page.acceptedCount).toBe(3);
  });

  it('shows the invitee whose yes is held their own guardian step, masked', async () => {
    const page = await load(HELD);

    expect(page.myInvite).toMatchObject({ id: 'inv-held', status: 'pending_approval' });
    expect(page.canAccessThread).toBe(false);
    expect(page.guardianStep).toEqual({
      request: { status: 'pending', sentTo: 'p•••@example.com', requestedAt: '2026-09-20T00:00:00Z', emailStatus: 'sent' },
    });
    expect(page.pendingParentalApprovals).toEqual([]);
  });

  it('asks no guardian questions on a plan that does not need a guardian', async () => {
    seedPlan({ parental_approval: false });

    await load(HOST);
    const guest = await load(YES);

    expect(queriesOn('admin', 'parental_approvals')).toEqual([]);
    expect(guest.guardianStep).toBeNull();
  });
});
