import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  describeError,
  OBSERVABILITY_WEBHOOK_DEDUPE_MS,
  reportOperationalError,
} from './observability';

describe('describeError', () => {
  test('uses the message of a real Error', () => {
    expect(describeError(new Error('boom'))).toEqual({ message: 'boom' });
  });

  test('preserves Supabase/PostgREST structured fields (not [object Object])', () => {
    const supabaseError = {
      message: 'permission denied for table events',
      code: '42501',
      details: 'RLS',
      hint: 'check policy',
    };
    expect(describeError(supabaseError)).toEqual({
      message: 'permission denied for table events',
      code: '42501',
      details: 'RLS',
    });
  });

  test('falls back to code when an error object has no message', () => {
    expect(describeError({ code: 'PGRST116' })).toEqual({
      message: 'PGRST116',
      code: 'PGRST116',
      details: undefined,
    });
  });

  test('serializes a plain object rather than [object Object]', () => {
    expect(describeError({ foo: 'bar' })).toEqual({ message: '{"foo":"bar"}' });
  });

  test('handles primitive throws', () => {
    expect(describeError('nope')).toEqual({ message: 'nope' });
    expect(describeError(null)).toEqual({ message: 'null' });
  });
});

describe('observability webhook dedupe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    vi.stubEnv('OBSERVABILITY_WEBHOOK_URL', 'https://observability.example.test/hook');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('posts the same area and user-facing code once inside 60 seconds', async () => {
    await reportOperationalError(
      'observability.test.dedupe',
      new Error('first'),
      {},
      'SB-PLAN-SAVE',
    );
    await reportOperationalError(
      'observability.test.dedupe',
      new Error('second'),
      {},
      'SB-PLAN-SAVE',
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  test('keeps area and code as independent dedupe dimensions', async () => {
    await reportOperationalError(
      'observability.test.dimension-a',
      new Error('one'),
      {},
      'SB-PLAN-SAVE',
    );
    await reportOperationalError(
      'observability.test.dimension-a',
      new Error('two'),
      {},
      'SB-PLAN-LOAD',
    );
    await reportOperationalError(
      'observability.test.dimension-b',
      new Error('three'),
      {},
      'SB-PLAN-SAVE',
    );

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('opens a fresh webhook window after 60 seconds', async () => {
    await reportOperationalError(
      'observability.test.expiry',
      new Error('one'),
      {},
      'SB-PLAN-SAVE',
    );
    vi.advanceTimersByTime(OBSERVABILITY_WEBHOOK_DEDUPE_MS);
    await reportOperationalError(
      'observability.test.expiry',
      new Error('two'),
      {},
      'SB-PLAN-SAVE',
    );

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
