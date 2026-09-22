import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANSWERABLE_EVENT_STATUSES,
  canAnswer,
  canReadPlan,
  canRequestOpenTable,
  hostCanEditInvitees,
  hostCanEditLine,
  hostCanShare,
  shareLinkNotice,
  shareLinkState,
  unfurlsPlanDetails,
  type ShareLinkState,
} from './share-link';
import type { EventStatus } from './types';

/**
 * The invite-link regression suite.
 *
 * Shared plan links broke for recipients repeatedly, and the shape of the bug
 * never changed: the app offered a host a link that its own recipient page
 * rejected. Each fix aligned one pair of surfaces; the next plan that deviated
 * slightly landed on a pair that was still out of step.
 *
 * These tests are written against the whole space rather than the case that
 * happened to be reported. Every event status crossed with every value of the
 * host's kill switch is twelve combinations, so they are all enumerated — and
 * the invariants below hold for all twelve or the suite fails. A new status is
 * a compile error in share-link.ts and a test failure here until someone has
 * decided what a recipient holding a link should see.
 */

const ALL_STATUSES: EventStatus[] = [
  'draft',
  'deciding',
  'inviting',
  'confirmed',
  'cancelled',
  'past',
];

const MATRIX = ALL_STATUSES.flatMap((status) =>
  [true, false].map((share_link_active) => ({ status, share_link_active })),
);

const ALL_STATES: ShareLinkState[] = [
  'missing',
  'off',
  'unpublished',
  'deciding',
  'live',
  'cancelled',
  'past',
];

describe('shareLinkState', () => {
  it('classifies every status × kill-switch combination', () => {
    for (const event of MATRIX) {
      const state = shareLinkState(event);
      expect(ALL_STATES, `${event.status}/${event.share_link_active}`).toContain(state);
    }
    // A token that resolves to nothing is a state, not an error.
    expect(shareLinkState(null)).toBe('missing');
    expect(shareLinkState(undefined)).toBe('missing');
  });

  it('lets the host kill switch outrank the plan status', () => {
    for (const status of ALL_STATUSES) {
      expect(shareLinkState({ status, share_link_active: false })).toBe('off');
    }
  });

  it('treats a plan whose date is still being polled as its own state', () => {
    // The regression that started this: `deciding` used to be lumped in with a
    // switched-off link, so a host running a date poll had every recipient told
    // "this invite link isn't active" for as long as the poll ran.
    expect(shareLinkState({ status: 'deciding', share_link_active: true })).toBe('deciding');
  });

  it('lets a plan still picking its date be answered, with a caveat', () => {
    // Readable was only half the fix. Someone who taps a link to a barbecue
    // wants to say they're coming; an unsettled date is a caveat to show them,
    // not a reason to withhold the buttons.
    expect(canAnswer('deciding')).toBe(true);
    expect(canReadPlan('deciding')).toBe(true);
    // …and the caveat is present, so the yes is an informed one.
    expect(shareLinkNotice('deciding')?.heading).toBe('The date isn’t set yet');
  });

  it('still refuses an answer to a plan that is over, off, or unpublished', () => {
    for (const state of ['missing', 'off', 'unpublished', 'cancelled', 'past'] as const) {
      expect(canAnswer(state), state).toBe(false);
    }
  });
});

describe('the invariants that keep links working', () => {
  it('keeps invite-list editing in one status rule', () => {
    expect(ALL_STATUSES.filter(hostCanEditInvitees)).toEqual(['inviting']);
    // Editing the line is wider by exactly one status: while a date poll runs
    // nothing has been sent, so the order is still a draft. Anything wider than
    // this would let a host rewrite invitations that have already gone out.
    expect(ALL_STATUSES.filter(hostCanEditLine)).toEqual(['deciding', 'inviting']);
    expect(ALL_STATUSES.filter(canRequestOpenTable)).toEqual(['inviting', 'confirmed']);

    const sourceFiles: string[] = [];
    const visit = (path: string) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(child);
      }
    };
    visit(join(process.cwd(), 'src', 'lib', 'actions'));
    visit(join(process.cwd(), 'src', 'app', 'events'));
    visit(join(process.cwd(), 'src', 'components', 'events'));
    const localModules = new Set([
      join(process.cwd(), 'src', 'lib', 'share-link.ts'),
      join(process.cwd(), 'src', 'lib', 'share-link.test.ts'),
    ]);
    const repeatedRule = /status\s*(?:===|!==)\s*['"]inviting['"]/;
    const offenders = sourceFiles
      .filter((file) => !localModules.has(file))
      .filter((file) => repeatedRule.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => file.replace(`${process.cwd()}/`, ''))).toEqual([]);
  });

  it('lets anyone who may change the guest list change the line too', () => {
    // The narrower permission has to imply the wider one. If adding people were
    // ever allowed somewhere reordering them is not, a host could build a line
    // she cannot then put in order.
    for (const status of ALL_STATUSES) {
      if (hostCanEditInvitees(status)) {
        expect(hostCanEditLine(status), status).toBe(true);
      }
    }
  });

  it('never offers a share affordance for a link the recipient cannot read', () => {
    // This is the invariant that was violated in production. If it ever fails,
    // some surface is handing out a link that dead-ends.
    for (const state of ALL_STATES) {
      if (hostCanShare(state)) {
        expect(canReadPlan(state), `${state} is shareable but not readable`).toBe(true);
      }
    }
  });

  it('narrows capabilities monotonically: answer ⊆ share ⊆ read', () => {
    for (const state of ALL_STATES) {
      if (canAnswer(state)) expect(hostCanShare(state), state).toBe(true);
      if (hostCanShare(state)) expect(canReadPlan(state), state).toBe(true);
    }
  });

  it('never unfurls plan details for a link that is not being shared', () => {
    // The OG card is addressed by event id, which is far more guessable than a
    // share token, so it must not be looser than the share affordance itself.
    for (const state of ALL_STATES) {
      if (unfurlsPlanDetails(state)) {
        expect(hostCanShare(state), `${state} unfurls but is not shareable`).toBe(true);
      }
    }
  });

  it('always has something to say when the link is not simply live', () => {
    // A blank page is how "isn't active" got reused for every unrelated cause.
    for (const state of ALL_STATES) {
      const notice = shareLinkNotice(state);
      if (state === 'live') {
        expect(notice).toBeNull();
      } else {
        expect(notice?.heading, state).toBeTruthy();
        expect(notice?.body, state).toBeTruthy();
      }
    }
  });

  it('gives an answerable-but-incomplete state a caveat, not a refusal', () => {
    // The page shows this copy ABOVE the buttons rather than instead of them, so
    // for any state that is both answerable and noticed, the wording has to read
    // as a heads-up. Nothing here may tell someone they cannot respond.
    for (const state of ALL_STATES) {
      const notice = shareLinkNotice(state);
      if (!notice || !canAnswer(state)) continue;
      expect(`${notice.heading} ${notice.body}`.toLowerCase(), state).not.toMatch(
        /can’t answer|cannot answer|isn’t taking|nothing to answer/,
      );
    }
  });

  it('only says "isn’t active" when the link genuinely is not active', () => {
    // The reported complaint was this copy appearing for a plan that was fine.
    // A cancelled, finished, or mid-poll plan gets copy that names the reason.
    for (const state of ALL_STATES) {
      const heading = shareLinkNotice(state)?.heading ?? '';
      if (state === 'missing' || state === 'off') {
        expect(heading).toContain('isn’t active');
      } else {
        expect(heading, state).not.toContain('isn’t active');
      }
    }
  });

  it('weaves the host name into the copy that reads better with it', () => {
    expect(shareLinkNotice('deciding', 'Gina')?.body).toContain('Gina');
    // A missing name degrades to a sentence, never a gap.
    expect(shareLinkNotice('deciding', '   ')?.body).toContain('The host');
    expect(shareLinkNotice('cancelled', null)?.body).toContain('The host');
  });
});

describe('TypeScript and SQL agree on who can answer', () => {
  /**
   * `rsvp_via_share_token` refuses any status outside its own tuple. If that
   * tuple and ANSWERABLE_EVENT_STATUSES drift apart, the page renders RSVP
   * buttons the database will reject — a broken link with extra steps. Read the
   * migration and compare, so the drift fails here rather than in someone's
   * messages.
   */
  it('matches the status tuple inside rsvp_via_share_token', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const withFunction = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .filter((name) =>
        readFileSync(join(dir, name), 'utf8').includes(
          'function public.rsvp_via_share_token',
        ),
      );
    expect(withFunction.length, 'no migration defines rsvp_via_share_token').toBeGreaterThan(0);

    // The last definition wins at migrate time, so that is the one to check.
    const sql = readFileSync(join(dir, withFunction[withFunction.length - 1]), 'utf8');
    const match = sql.match(/v_event\.status\s+not\s+in\s*\(([^)]*)\)/i);
    expect(match, 'could not find the status guard in rsvp_via_share_token').not.toBeNull();

    const sqlStatuses = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...sqlStatuses].sort()).toEqual([...ANSWERABLE_EVENT_STATUSES].sort());
  });

  it('derives canAnswer from that same set', () => {
    for (const status of ALL_STATUSES) {
      const answerable = canAnswer(shareLinkState({ status, share_link_active: true }));
      expect(answerable, status).toBe(ANSWERABLE_EVENT_STATUSES.includes(status));
    }
  });
});
