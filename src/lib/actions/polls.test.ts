import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  isEventManager: vi.fn(),
  resolvePoll: vi.fn(),
  openFollowUpPolls: vi.fn(),
  revalidatePath: vi.fn(),
  reportAndFail: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({
  requireUser: async () => ({ ok: true, supabase: { from: mocks.from }, user: { id: 'host-1' } }),
}));
vi.mock('@/lib/server/authz', () => ({ isEventManager: mocks.isEventManager }));
vi.mock('@/lib/server/poll-runner', () => ({
  resolvePoll: mocks.resolvePoll, openFollowUpPolls: mocks.openFollowUpPolls,
}));
vi.mock('@/lib/server/notify', () => ({ notifySuggestionAdded: vi.fn() }));
vi.mock('@/lib/server/media', () => ({ isOwnPublicStorageUrl: vi.fn() }));
vi.mock('@/lib/server/observability', () => ({ reportAndFail: mocks.reportAndFail }));
vi.mock('@/lib/analytics/server', () => ({ capture: vi.fn() }));

import { addFollowUpPoll, closeVoting, openVoting, pickWinner, retryFollowUpPolls } from './polls';

let phase: string;
let updates: unknown[];
let inserts: unknown[];
let allowSuggestions: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  phase = 'suggesting';
  updates = [];
  inserts = [];
  allowSuggestions = true;
  mocks.isEventManager.mockResolvedValue(true);
  mocks.openFollowUpPolls.mockResolvedValue([]);
  mocks.resolvePoll.mockResolvedValue(undefined);
  mocks.reportAndFail.mockResolvedValue({ ok: false, code: 'SB-POLL-DECIDE', error: 'Could not decide.' });
  mocks.from.mockImplementation((table: string) => {
    let writing = false;
    const result = () => ({
      data: writing ? [{ id: 'poll-1' }] : table === 'poll_options'
        ? { poll_id: 'poll-1' }
        : { id: 'poll-1', event_id: 'event-1', phase, resolution: 'auto', allow_suggestions: allowSuggestions },
      error: null,
    });
    const query: Record<string, unknown> = {};
    for (const name of ['select', 'eq']) query[name] = () => query;
    query.update = (data: unknown) => { writing = true; updates.push(data); return query; };
    query.insert = (data: unknown) => { writing = true; inserts.push(data); return query; };
    query.maybeSingle = async () => result();
    query.then = (resolve: (value: ReturnType<typeof result>) => void) => Promise.resolve(result()).then(resolve);
    return query;
  });
});

describe('poll host controls', () => {
  it('makes Lock suggestions enforce the guest-insert policy', async () => {
    await expect(openVoting('poll-1', 'event-1')).resolves.toEqual({ ok: true });
    expect(updates).toEqual([{ phase: 'voting', allow_suggestions: false }]);
  });

  it('refuses a non-host before writing a suggestion lock', async () => {
    mocks.isEventManager.mockResolvedValue(false);
    await expect(openVoting('poll-1', 'event-1')).resolves.toMatchObject({ ok: false, code: 'SB-PERM-HOST' });
    expect(updates).toEqual([]);
  });

  it('turns a failed runner write into the same diagnostic the host sees', async () => {
    const error = { code: '08006', message: 'Database unavailable' };
    mocks.resolvePoll.mockRejectedValue(error);
    await expect(closeVoting('poll-1', 'event-1')).resolves.toMatchObject({ ok: false, code: 'SB-POLL-DECIDE' });
    expect(mocks.reportAndFail).toHaveBeenCalledWith('SB-POLL-DECIDE', 'poll.close', error, {
      pollId: 'poll-1', eventId: 'event-1',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('lets an already-saved decision retry its follow-up unlock', async () => {
    phase = 'decided';
    await closeVoting('poll-1', 'event-1');
    expect(mocks.resolvePoll).toHaveBeenCalledWith('poll-1');
  });

  it('handles a follow-up failure after an explicit winner pick with a diagnostic', async () => {
    const error = { message: 'RPC unavailable' };
    mocks.openFollowUpPolls.mockRejectedValue(error);
    await expect(pickWinner('poll-1', 'event-1', 'option-1')).resolves.toMatchObject({
      ok: false, code: 'SB-POLL-DECIDE',
    });
    expect(mocks.reportAndFail).toHaveBeenCalledWith('SB-POLL-DECIDE', 'poll.pick', error, {
      pollId: 'poll-1', eventId: 'event-1',
    });
  });
});

describe('follow-up questions', () => {
  it('reports a saved question with a diagnostic when opening fails, without inviting a duplicate insert', async () => {
    mocks.openFollowUpPolls.mockRejectedValue(new Error('RPC unavailable'));
    await expect(addFollowUpPoll('poll-1', 'event-1', 'place')).resolves.toMatchObject({
      ok: true, opened: false, warning: { code: 'SB-POLL-DECIDE' },
    });
    expect(inserts).toHaveLength(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1');
  });

  it('retries only the existing question unlock without inserting again or closing the parent', async () => {
    mocks.openFollowUpPolls.mockResolvedValue(['new-poll']);
    await expect(retryFollowUpPolls('poll-1', 'event-1')).resolves.toEqual({ ok: true, opened: true });
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
    expect(mocks.resolvePoll).not.toHaveBeenCalled();
    expect(mocks.openFollowUpPolls).toHaveBeenCalledWith('poll-1');
  });

  it('refuses an unlock retry for a poll outside the host’s plan', async () => {
    await expect(retryFollowUpPolls('poll-1', 'other-event')).resolves.toMatchObject({ ok: false });
    expect(mocks.openFollowUpPolls).not.toHaveBeenCalled();
  });

  it('starts a fresh brainstorm even when the parent locked guest suggestions', async () => {
    phase = 'decided';
    allowSuggestions = false;
    await addFollowUpPoll('poll-1', 'event-1', 'place');
    expect(inserts).toEqual([expect.objectContaining({
      parent_poll_id: 'poll-1', phase: 'pending', allow_suggestions: true,
    })]);
  });

  it('opens a question added after the parent has already been decided', async () => {
    phase = 'decided';
    mocks.openFollowUpPolls.mockResolvedValue(['new-poll']);
    await expect(addFollowUpPoll('poll-1', 'event-1', 'place')).resolves.toEqual({
      ok: true, opened: true,
    });
    expect(mocks.openFollowUpPolls).toHaveBeenCalledWith('poll-1');
  });

  it('keeps the question queued while its parent is open', async () => {
    await expect(addFollowUpPoll('poll-1', 'event-1', 'place')).resolves.toEqual({
      ok: true, opened: false,
    });
  });
});
