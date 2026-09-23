import { describe, expect, it } from 'vitest';
import { circleEmoji, DEFAULT_CIRCLE_EMOJI } from './circle-emoji';

describe('circleEmoji', () => {
  it('keeps a multi-part emoji whole', () => {
    expect(circleEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(circleEmoji('👋🏽')).toBe('👋🏽');
    expect(circleEmoji('🇺🇸')).toBe('🇺🇸');
  });

  it('keeps only the first character', () => {
    expect(circleEmoji('📚🎉')).toBe('📚');
    expect(circleEmoji('abcd')).toBe('a');
  });

  it('falls back when blank', () => {
    expect(circleEmoji('   ')).toBe(DEFAULT_CIRCLE_EMOJI);
    expect(circleEmoji(undefined)).toBe(DEFAULT_CIRCLE_EMOJI);
  });
});
