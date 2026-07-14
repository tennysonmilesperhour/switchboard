import { describe, expect, test } from 'vitest';
import { describeError } from './observability';

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
