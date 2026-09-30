import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { categoryForKind } from './notifications';
import { SABBATICAL_KINDS, sabbaticalAllows, sabbaticalOf } from './sabbatical';

describe('sabbaticalAllows (D6)', () => {
  it('lets through what a plan you are already in says to you', () => {
    for (const kind of [
      'event_updated',
      'event_urgent_change',
      'event_cancelled',
      'event_date_set',
      'announcement',
      'reminder',
      'event_comment',
      'rsvp_declined_note',
    ]) {
      expect(sabbaticalAllows(kind), kind).toBe(true);
    }
  });

  it('mutes everything that reaches for you from outside those plans', () => {
    for (const kind of [
      'event_invite',
      'cohost_added',
      'poll_suggestion',
      // "Help pick the date" asks people into a new plan that starts as a vote.
      'poll_opened',
      'connection_request',
      'connection_accepted',
      'match',
      'interest_received',
      'ritual',
      'board_post',
      'zone_join_request',
      'moment',
    ]) {
      expect(sabbaticalAllows(kind), kind).toBe(false);
    }
  });

  it('lets a room message through only from a plan’s own room', () => {
    expect(sabbaticalAllows('room_message', { planRoom: true })).toBe(true);
    expect(sabbaticalAllows('room_message', { planRoom: false })).toBe(false);
    expect(sabbaticalAllows('room_message')).toBe(false);
  });

  it('mutes a kind nobody decided on, and a push with no kind', () => {
    expect(sabbaticalAllows('brand_new_kind')).toBe(false);
    expect(sabbaticalAllows(undefined)).toBe(false);
    expect(sabbaticalAllows('')).toBe(false);
  });

  it('only lists kinds the app actually sends', () => {
    // Every kind on the list is either categorised or one of the answers left
    // uncategorised on purpose, so a typo here cannot pass unnoticed.
    const deliberatelyUnmapped = new Set(['parental_approval', 'parental_approval_denied']);
    for (const kind of SABBATICAL_KINDS) {
      expect(categoryForKind(kind) !== null || deliberatelyUnmapped.has(kind), kind).toBe(true);
    }
  });

  /**
   * Texts and emails are held by `private.sabbatical_allows` in the database,
   * so the push gate and the queues answer the same question in two
   * languages. This reads the latest migration that defines it and fails the
   * moment the lists differ.
   */
  it('matches private.sabbatical_allows in the database', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const files = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .filter((name) =>
        readFileSync(join(dir, name), 'utf8').includes('function private.sabbatical_allows'),
      );
    expect(files.length, 'no migration defines private.sabbatical_allows').toBeGreaterThan(0);
    const sql = readFileSync(join(dir, files[files.length - 1]), 'utf8');
    const body = sql.slice(sql.indexOf('function private.sabbatical_allows'));
    const list = body.match(/p_kind in \(([\s\S]*?)\)\s*, false\)/);
    expect(list, 'could not find the kind list in private.sabbatical_allows').not.toBeNull();
    const kinds = [...(list as RegExpMatchArray)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(kinds.sort()).toEqual([...SABBATICAL_KINDS].sort());
  });
});

describe('sabbaticalOf', () => {
  it('is null for someone not on sabbatical', () => {
    expect(sabbaticalOf({ sabbatical: false, sabbatical_message: 'Back soon' })).toBeNull();
    expect(sabbaticalOf(null)).toBeNull();
  });

  it('carries their note as written, trimmed', () => {
    expect(sabbaticalOf({ sabbatical: true, sabbatical_message: '  Back in spring ' })).toEqual({
      note: 'Back in spring',
    });
  });

  it('has no note when they left it blank', () => {
    expect(sabbaticalOf({ sabbatical: true, sabbatical_message: '   ' })).toEqual({ note: null });
    expect(sabbaticalOf({ sabbatical: true })).toEqual({ note: null });
  });
});
