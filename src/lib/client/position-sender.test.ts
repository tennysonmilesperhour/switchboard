import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPositionSender, HEARTBEAT_MS, MIN_GAP_MS, type Fix } from './position-sender';

const at = (lat: number, lng = -104.99, accuracyM = 10): Fix => ({ point: { lat, lng }, accuracyM });
// 39.7395 is the rounding edge between the 39.739 and 39.740 cells.
const WEST_OF_EDGE = at(39.73949);
const EAST_OF_EDGE = at(39.73951);

describe('createPositionSender', () => {
  let sent: Fix[];

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
  });
  afterEach(() => vi.useRealTimers());

  it('a still phone wobbling across a cell edge once a second writes at most four times a minute', () => {
    const sender = createPositionSender((fix) => sent.push(fix));
    sender.sent(WEST_OF_EDGE);
    for (let second = 0; second < 3600; second += 1) {
      sender.push(second % 2 === 0 ? EAST_OF_EDGE : WEST_OF_EDGE);
      vi.advanceTimersByTime(1000);
    }
    // The server allows 300 an hour; the old rule spent ~3,600.
    expect(sent.length).toBeLessThanOrEqual(240);
    sender.stop();
  });

  it('sends a move to a new cell at once when the gap allows, and the latest fix when it does not', () => {
    const sender = createPositionSender((fix) => sent.push(fix));
    sender.sent(at(39.739));
    vi.advanceTimersByTime(MIN_GAP_MS);
    sender.push(at(39.741));
    expect(sent).toEqual([at(39.741)]);

    // Two more cells inside the gap: only the latest goes, when the gap is up.
    sender.push(at(39.743));
    sender.push(at(39.745));
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(MIN_GAP_MS);
    expect(sent).toEqual([at(39.741), at(39.745)]);
    sender.stop();
  });

  it('keeps a phone that never moves fresh with a heartbeat, and stops it when told', () => {
    const sender = createPositionSender((fix) => sent.push(fix));
    sender.sent(at(39.739));
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(sent).toEqual([at(39.739)]);
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(sent).toHaveLength(3);

    sender.stop();
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(sent).toHaveLength(3);
  });

  it('ignores ticks inside the cell it last wrote', () => {
    const sender = createPositionSender((fix) => sent.push(fix));
    sender.sent(at(39.7391));
    vi.advanceTimersByTime(MIN_GAP_MS);
    sender.push(at(39.7392));
    sender.push(at(39.7389));
    expect(sent).toEqual([]);
    sender.stop();
  });

  it('sends at once when the page shows again, so a phone back from its pocket is back on the map', () => {
    const sender = createPositionSender((fix) => sent.push(fix));
    sender.sent(at(39.739));
    vi.advanceTimersByTime(MIN_GAP_MS);
    sender.push(at(39.7391)); // same cell: nothing new to say
    expect(sent).toEqual([]);
    sender.wake();
    expect(sent).toEqual([at(39.7391)]);
    sender.stop();
  });
});
