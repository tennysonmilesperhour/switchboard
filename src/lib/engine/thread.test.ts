import { describe, expect, test } from 'vitest';
import { THREAD_PREVIEW_COUNT, threadGate } from './thread';

describe('threadGate', () => {
  test('unlocked viewers see every message and no blur', () => {
    const gate = threadGate(7, true);
    expect(gate).toEqual({
      unlocked: true,
      visibleCount: 7,
      hiddenCount: 0,
      blurRows: 0,
    });
  });

  test('locked viewers see only the opening preview', () => {
    const gate = threadGate(9, false);
    expect(gate.unlocked).toBe(false);
    expect(gate.visibleCount).toBe(THREAD_PREVIEW_COUNT);
    expect(gate.hiddenCount).toBe(9 - THREAD_PREVIEW_COUNT);
  });

  test('blur rows are capped so a long thread does not paint a wall', () => {
    const gate = threadGate(50, false, 2, 4);
    expect(gate.hiddenCount).toBe(48);
    expect(gate.blurRows).toBe(4);
  });

  test('a locked viewer never sees more than exists', () => {
    const gate = threadGate(1, false);
    expect(gate.visibleCount).toBe(1);
    expect(gate.hiddenCount).toBe(0);
    expect(gate.blurRows).toBe(0);
  });

  test('an empty thread gates cleanly for a locked viewer', () => {
    const gate = threadGate(0, false);
    expect(gate).toEqual({
      unlocked: false,
      visibleCount: 0,
      hiddenCount: 0,
      blurRows: 0,
    });
  });

  test('nonsense totals are floored to a sane count', () => {
    expect(threadGate(-3, false).visibleCount).toBe(0);
    expect(threadGate(3.7, true).visibleCount).toBe(3);
  });
});
