import { describe, expect, it } from 'vitest';
import type { SwitchboardEvent } from '@/lib/types';
import { LISTED_INVITE_STATUSES, sortPlans } from './sections';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const FUTURE = '2026-10-10T18:00:00Z';
const PAST = '2026-09-01T18:00:00Z';

function event(id: string, overrides: Partial<SwitchboardEvent> = {}): SwitchboardEvent {
  return {
    id,
    host_id: 'someone-else',
    title: id,
    status: 'inviting',
    starts_at: FUTURE,
    ...overrides,
  } as SwitchboardEvent;
}

function sort(input: Partial<Parameters<typeof sortPlans>[0]>) {
  return sortPlans({
    userId: 'me',
    hosted: [],
    cohosted: [],
    invited: [],
    nowMs: NOW,
    ...input,
  });
}

describe('/plans sections', () => {
  it('keeps a waitlisted invitation out of Going', () => {
    const sections = sort({
      invited: [
        { status: 'accepted', event: event('in') },
        { status: 'waitlisted', event: event('full') },
      ],
    });
    expect(sections.going.map((row) => row.event.id)).toEqual(['in']);
    expect(sections.waitlisted.map((row) => row.event.id)).toEqual(['full']);
  });

  it('gives Open Table requests their own section', () => {
    const sections = sort({ invited: [{ status: 'requested', event: event('ask') }] });
    expect(sections.requested.map((row) => row.event.id)).toEqual(['ask']);
    expect(sections.going).toEqual([]);
  });

  it('keeps a guardian-held yes out of Going', () => {
    const sections = sort({
      invited: [{ status: 'pending_approval', event: event('youth') }],
    });
    expect(sections.awaitingGuardian.map((row) => row.event.id)).toEqual(['youth']);
    expect(sections.going).toEqual([]);
  });

  it('lists co-hosted plans under Hosting, once, marked as co-hosting', () => {
    const shared = event('shared');
    const sections = sort({
      hosted: [event('mine', { host_id: 'me' })],
      cohosted: [shared],
      // The co-host also holds an invitation to the same plan.
      invited: [{ status: 'accepted', event: shared }],
    });
    expect(sections.hosting.map(({ event: row, cohost }) => [row.id, cohost])).toEqual([
      ['mine', false],
      ['shared', true],
    ]);
    expect(sections.going).toEqual([]);
  });

  it('drops cancelled co-hosted plans, like cancelled hosted ones', () => {
    const sections = sort({ cohosted: [event('off', { status: 'cancelled' })] });
    expect(sections.hosting).toEqual([]);
    expect(sections.past).toEqual([]);
  });

  it('archives only plans you hosted, co-hosted, or went to', () => {
    const sections = sort({
      cohosted: [event('ran-it', { starts_at: PAST })],
      invited: [
        { status: 'accepted', event: event('went', { starts_at: PAST }) },
        { status: 'waitlisted', event: event('never-got-in', { starts_at: PAST }) },
        { status: 'requested', event: event('never-let-in', { starts_at: PAST }) },
        { status: 'sent', event: event('never-answered', { starts_at: PAST }) },
      ],
    });
    expect(sections.past.map((row) => row.id).sort()).toEqual(['ran-it', 'went']);
  });

  it('shows a queued invitation only while the plan is deciding', () => {
    const sections = sort({
      invited: [
        { status: 'queued', event: event('poll', { status: 'deciding', starts_at: null }) },
        { status: 'queued', event: event('line') },
      ],
    });
    expect(sections.deciding.map((row) => row.event.id)).toEqual(['poll']);
  });

  it('reads every status it has a section for', () => {
    expect([...LISTED_INVITE_STATUSES].sort()).toEqual(
      ['accepted', 'pending_approval', 'queued', 'requested', 'sent', 'waitlisted'].sort(),
    );
  });
});
