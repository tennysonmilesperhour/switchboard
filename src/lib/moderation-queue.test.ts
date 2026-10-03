import { describe, expect, it } from 'vitest';
import { alreadyHandled, splitQueue } from './moderation-queue';

const base = { target_kind: 'board_post', target_removed_at: null, reported_suspended_until: null };

describe('alreadyHandled', () => {
  it('is null when nothing has been done yet', () => {
    expect(alreadyHandled(base)).toBeNull();
  });

  it('names a removed post or message', () => {
    expect(alreadyHandled({ ...base, target_removed_at: '2026-10-01T00:00:00Z' })).toBe(
      'Already handled: post removed',
    );
    expect(
      alreadyHandled({
        ...base,
        target_kind: 'room_message',
        target_removed_at: '2026-10-01T00:00:00Z',
      }),
    ).toBe('Already handled: message removed');
  });

  it('names a suspended author, alone or with a removal', () => {
    expect(alreadyHandled({ ...base, reported_suspended_until: '2026-11-01T00:00:00Z' })).toBe(
      'Already handled: account suspended',
    );
    expect(
      alreadyHandled({
        ...base,
        target_removed_at: '2026-10-01T00:00:00Z',
        reported_suspended_until: '2026-11-01T00:00:00Z',
      }),
    ).toBe('Already handled: post removed and account suspended');
  });
});

describe('splitQueue', () => {
  it('puts handled reports after open ones without dropping any, keeping order', () => {
    const reports = [
      { ...base, id: 'a', target_removed_at: '2026-10-01T00:00:00Z' },
      { ...base, id: 'b' },
      { ...base, id: 'c', reported_suspended_until: '2026-11-01T00:00:00Z' },
      { ...base, id: 'd' },
    ];
    const { open, handled } = splitQueue(reports);
    expect(open.map((r) => r.id)).toEqual(['b', 'd']);
    expect(handled.map((r) => r.id)).toEqual(['a', 'c']);
  });
});
