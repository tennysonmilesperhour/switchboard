import { describe, expect, it } from 'vitest';
import { sourceIsBackedOff } from './external-event-collector';

const source = {
  id: 'test', name: 'Test', url: 'https://example.com/events', format: 'html' as const,
  city: 'Salt Lake City', time_zone: 'America/Denver', trust_score: 80, stale_after_hours: 30,
};

describe('external event source circuit breaker', () => {
  it('does not back off a first failure', () => {
    expect(sourceIsBackedOff({ ...source, consecutive_failures: 1, last_started_at: '2026-10-07T16:00:00Z' }, Date.parse('2026-10-07T16:01:00Z'))).toBe(false);
  });

  it('backs off repeated failures and then permits a retry', () => {
    const failing = { ...source, consecutive_failures: 3, last_started_at: '2026-10-07T16:00:00Z' };
    expect(sourceIsBackedOff(failing, Date.parse('2026-10-07T17:00:00Z'))).toBe(true);
    expect(sourceIsBackedOff(failing, Date.parse('2026-10-07T19:00:01Z'))).toBe(false);
  });
});
