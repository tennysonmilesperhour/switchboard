/** What a circle shows when its emoji is left blank. */
export const DEFAULT_CIRCLE_EMOJI = '👥';

/**
 * The single emoji a circle keeps: the first user-perceived character of what
 * was typed. Slicing by UTF-16 units split skin-tone and family emoji (👨‍👩‍👧 is
 * eight units) into a broken glyph, and kept "abcd" whole. A blank value falls
 * back to the default.
 */
export function circleEmoji(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return DEFAULT_CIRCLE_EMOJI;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const first = segmenter.segment(trimmed)[Symbol.iterator]().next().value?.segment;
  return first || DEFAULT_CIRCLE_EMOJI;
}
