import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The bell badge contract: **everything the badge counts must be clearable from
 * the screen the badge opens.**
 *
 * This is here because it was broken for a real person. The badge used to be
 * `pending invites + pending connection requests + unread notifications`, from
 * before `public.notifications` existed. By the time it did, an invitation and
 * a connection request each wrote a row there too — so one invitation counted
 * twice, and the half of it that came from the `invites` table had no read
 * state at all. Somebody read every notification, pressed the only clearing
 * control on the page, and was left with a badge that would not go out and
 * nothing on screen that would turn it off.
 *
 * A count assembled in one file and cleared in another will drift again, and
 * the drift is invisible until someone reports it. So the rule is checked
 * against the source: the badge reads one table, and the actions on the
 * notifications screen cover that table.
 */

const SRC = join(process.cwd(), 'src');

const read = (path: string) => readFileSync(join(SRC, path), 'utf8');

/** Every `.from('table')` in a file, in order. */
function tablesQueriedIn(source: string): string[] {
  return [...source.matchAll(/\.from\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
}

describe('the bell badge', () => {
  const bell = read('components/shell/NotificationBell.tsx');

  it('counts one table, and it is the notifications table', () => {
    expect(tablesQueriedIn(bell)).toEqual(['notifications']);
  });

  it('counts only rows that are unread, so reading them puts it out', () => {
    expect(bell).toMatch(/\.is\(\s*'read_at',\s*null\s*\)/);
  });

  it('never counts invites or connection requests — neither can be marked read', () => {
    // Both still appear on /notifications and are answered on /plans and
    // /people. They are state, not news, and state cannot be acknowledged.
    expect(bell).not.toContain("'invites'");
    expect(bell).not.toContain("'connections'");
  });
});

describe('the notifications screen', () => {
  const actions = read('lib/actions/notifications.ts');
  const feed = read('app/notifications/NotificationsFeed.tsx');

  it('can put the badge out: every table it counts is one the actions write', () => {
    const counted = new Set(tablesQueriedIn(read('components/shell/NotificationBell.tsx')));
    const cleared = new Set(tablesQueriedIn(actions));
    for (const table of counted) expect(cleared).toContain(table);
  });

  it('offers both a way to mark everything read and a way to empty the list', () => {
    expect(actions).toContain('export async function markAllNotificationsRead');
    expect(actions).toContain('export async function clearNotifications');
    expect(feed).toContain('markAllNotificationsRead');
    expect(feed).toContain('clearNotifications');
  });

  it('clears without a row limit, so nothing survives out of view', () => {
    // The bell counts every unread row. A clear that only covered the twenty on
    // screen would leave the badge lit with an empty list underneath it.
    expect(actions).not.toMatch(/\.limit\(/);
  });

  it('tells the reader when a clear fails instead of swallowing it', () => {
    // Both calls used to discard their result, so a failure was indistinguishable
    // from a success that simply hadn't refreshed yet.
    for (const call of ['markAllNotificationsRead()', 'clearNotifications()']) {
      const at = feed.indexOf(`await ${call}`);
      expect(at, `${call} is not called in the feed`).toBeGreaterThan(-1);
      expect(feed.slice(at, at + 220)).toContain('toast.error');
    }
  });
});
