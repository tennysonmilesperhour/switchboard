import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The moderation actions are thin on purpose: the database decides who may
 * act and on what (20260930070000_moderator_actions.sql, covered by
 * supabase/tests/moderator_actions.test.sql). What is pinned here is the part
 * that lives in TypeScript — every call goes through the moderator's own
 * session client (never the service role), bad input never reaches the
 * database, and each outcome the database can return says something true.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  reportAndFail: vi.fn(async (code: string) => ({ ok: false, code, error: 'failed', fix: null })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/server/observability', () => ({ reportAndFail: mocks.reportAndFail }));

import {
  liftSuspension,
  removeReportedMessage,
  removeReportedPost,
  suspendReportedAccount,
} from './moderation';

const REPORT = '00000000-0000-0000-0000-00000000e001';
const MEMBER = '00000000-0000-0000-0000-0000000000b2';
const POST = '00000000-0000-0000-0000-0000000000c3';
const MESSAGE = '00000000-0000-0000-0000-0000000000d4';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    ok: true,
    supabase: { rpc: mocks.rpc },
    user: { id: 'mod-1' },
  });
});

describe('suspendReportedAccount', () => {
  it('asks the database, as the moderator, to suspend for the chosen days', async () => {
    mocks.rpc.mockResolvedValue({ data: 'suspended', error: null });

    const result = await suspendReportedAccount(REPORT, MEMBER, 7, '  Harassment  ');

    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith('moderate_suspend_account', {
      p_member: MEMBER,
      p_report: REPORT,
      p_days: 7,
      p_note: 'Harassment',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('leaves the length open for a suspension until it is lifted', async () => {
    mocks.rpc.mockResolvedValue({ data: 'suspended', error: null });

    await suspendReportedAccount(REPORT, MEMBER, null);

    expect(mocks.rpc).toHaveBeenCalledWith('moderate_suspend_account', {
      p_member: MEMBER,
      p_report: REPORT,
      p_days: undefined,
      p_note: undefined,
    });
  });

  it('refuses a length that was never offered, before the database', async () => {
    const result = await suspendReportedAccount(REPORT, MEMBER, 3650);

    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses ids that are not ids, before the database', async () => {
    const result = await suspendReportedAccount('nope', MEMBER, 7);

    expect(result.ok).toBe(false);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it.each([
    ['self', /your own account/],
    ['moderator', /Moderators can’t be suspended/],
    ['not_found', /deleted/],
  ])('says what is true when the database answers %s', async (outcome, sentence) => {
    mocks.rpc.mockResolvedValue({ data: outcome, error: null });

    const result = await suspendReportedAccount(REPORT, MEMBER, 30);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(sentence);
  });

  it('carries its own code when the suspension does not save', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });

    const result = await suspendReportedAccount(REPORT, MEMBER, 7);

    expect(result).toMatchObject({ ok: false, code: 'SB-MODERATION-SUSPEND' });
    expect(mocks.reportAndFail).toHaveBeenCalledWith(
      'SB-MODERATION-SUSPEND',
      'moderation.suspend',
      { message: 'not authorized' },
      { reportId: REPORT },
    );
  });

  it('passes a signed-out or suspended caller’s refusal straight back', async () => {
    mocks.requireUser.mockResolvedValue({ ok: false, code: 'SB-AUTH-SUSPENDED', error: 'x', fix: null });

    const result = await suspendReportedAccount(REPORT, MEMBER, 7);

    expect(result).toMatchObject({ ok: false, code: 'SB-AUTH-SUSPENDED' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('liftSuspension', () => {
  it('lifts through the moderator’s own client', async () => {
    mocks.rpc.mockResolvedValue({ data: 'lifted', error: null });

    expect(await liftSuspension(MEMBER, 'Appeal upheld')).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith('moderate_lift_suspension', {
      p_member: MEMBER,
      p_note: 'Appeal upheld',
    });
  });

  it('treats an already-lifted suspension as the state that was asked for', async () => {
    mocks.rpc.mockResolvedValue({ data: 'not_suspended', error: null });

    expect(await liftSuspension(MEMBER)).toEqual({ ok: true });
  });

  it('carries the suspension code when lifting fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    expect(await liftSuspension(MEMBER)).toMatchObject({ ok: false, code: 'SB-MODERATION-SUSPEND' });
  });
});

describe('removing reported content', () => {
  it('removes a post against the report about it', async () => {
    mocks.rpc.mockResolvedValue({ data: 'removed', error: null });

    expect(await removeReportedPost(REPORT, POST)).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith('moderate_remove_board_post', {
      p_post: POST,
      p_report: REPORT,
      p_note: undefined,
    });
  });

  it('removes a message against the report about it', async () => {
    mocks.rpc.mockResolvedValue({ data: 'removed', error: null });

    expect(await removeReportedMessage(REPORT, MESSAGE, 'Slur')).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith('moderate_remove_room_message', {
      p_message: MESSAGE,
      p_report: REPORT,
      p_note: 'Slur',
    });
  });

  it('treats removing twice as done', async () => {
    mocks.rpc.mockResolvedValue({ data: 'already_removed', error: null });

    expect(await removeReportedMessage(REPORT, MESSAGE)).toEqual({ ok: true });
    expect(await removeReportedPost(REPORT, POST)).toEqual({ ok: true });
  });

  it('says so when the author already deleted it', async () => {
    mocks.rpc.mockResolvedValue({ data: 'not_found', error: null });

    const post = await removeReportedPost(REPORT, POST);
    const message = await removeReportedMessage(REPORT, MESSAGE);

    expect(post.error).toMatch(/already deleted/);
    expect(message.error).toMatch(/already deleted/);
  });

  it('carries the removal code when the database refuses', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'no open report about this message' } });

    expect(await removeReportedMessage(REPORT, MESSAGE)).toMatchObject({
      ok: false,
      code: 'SB-MODERATION-REMOVE',
    });
    expect(mocks.reportAndFail).toHaveBeenCalledWith(
      'SB-MODERATION-REMOVE',
      'moderation.remove-message',
      { message: 'no open report about this message' },
      { reportId: REPORT },
    );
  });
});
