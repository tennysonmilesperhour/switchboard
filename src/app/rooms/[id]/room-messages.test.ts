import { describe, expect, it } from 'vitest';
import {
  mergeRoomMessages,
  prependEarlierMessages,
  type RoomMessage,
} from './room-messages';

function message(id: string, body: string, at: string, sender = 'them'): RoomMessage {
  return { id, sender_id: sender, body, image_url: null, created_at: at };
}

describe('mergeRoomMessages', () => {
  it('adds messages the realtime channel missed, in time order', () => {
    const onScreen = [message('a', 'hi', '2026-09-29T10:00:00.000Z')];
    const server = [
      message('a', 'hi', '2026-09-29T10:00:00+00:00'),
      message('b', 'missed while asleep', '2026-09-29T10:05:00+00:00'),
    ];

    expect(mergeRoomMessages(onScreen, server).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('returns the same list when the server has nothing new', () => {
    const onScreen = [message('a', 'hi', '2026-09-29T10:00:00.000Z')];
    expect(mergeRoomMessages(onScreen, [...onScreen])).toBe(onScreen);
  });

  it('swaps a confirmed placeholder for the real row instead of showing both', () => {
    const onScreen = [
      message('a', 'hi', '2026-09-29T10:00:00.000Z'),
      message('optimistic-1', 'on my way', '2026-09-29T10:06:00.000Z', 'me'),
    ];
    const server = [
      message('a', 'hi', '2026-09-29T10:00:00+00:00'),
      message('c', 'on my way', '2026-09-29T10:06:00.100+00:00', 'me'),
    ];

    expect(mergeRoomMessages(onScreen, server).map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('keeps a placeholder the server has not confirmed yet', () => {
    const onScreen = [message('optimistic-1', 'sending', '2026-09-29T10:06:00.000Z', 'me')];
    const server = [message('b', 'someone else', '2026-09-29T10:05:00+00:00')];

    expect(mergeRoomMessages(onScreen, server).map((m) => m.id)).toEqual([
      'b',
      'optimistic-1',
    ]);
  });

  it('never drops a message older than the server window', () => {
    const onScreen = [message('old', 'from last month', '2026-08-01T10:00:00.000Z')];
    const server = [message('new', 'today', '2026-09-29T10:00:00+00:00')];

    expect(mergeRoomMessages(onScreen, server).map((m) => m.id)).toEqual(['old', 'new']);
  });

  it('drops a message its sender deleted, inside the window the server read', () => {
    const onScreen = [
      message('a', 'first', '2026-09-29T10:00:00.000Z'),
      message('gone', 'oops', '2026-09-29T10:01:00.000Z'),
      message('c', 'third', '2026-09-29T10:02:00.000Z'),
    ];
    const server = [
      message('a', 'first', '2026-09-29T10:00:00+00:00'),
      message('c', 'third', '2026-09-29T10:02:00+00:00'),
    ];

    expect(mergeRoomMessages(onScreen, server).map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('keeps a message newer than the server read (it arrived after the read)', () => {
    const onScreen = [
      message('a', 'first', '2026-09-29T10:00:00.000Z'),
      message('late', 'just now', '2026-09-29T10:09:00.000Z'),
    ];
    const server = [message('a', 'first', '2026-09-29T10:00:00+00:00')];

    expect(mergeRoomMessages(onScreen, server)).toBe(onScreen);
  });

  it('gives a realtime photo the signed URL from the server read', () => {
    const photo: RoomMessage = {
      ...message('p', '📷 Photo', '2026-09-29T10:00:00.000Z'),
      image_url: 'them/room-1.jpg',
    };
    const signed = { ...photo, image_src: 'https://signed.example/room-1.jpg' };

    const onScreen = [photo];
    const merged = mergeRoomMessages(onScreen, [signed]);

    expect(merged).not.toBe(onScreen);
    expect(merged[0].image_src).toBe('https://signed.example/room-1.jpg');
  });
});

describe('prependEarlierMessages', () => {
  it('puts older messages in front and skips ones already shown', () => {
    const onScreen = [
      message('b', 'second', '2026-09-29T10:01:00.000Z'),
      message('c', 'third', '2026-09-29T10:02:00.000Z'),
    ];
    const earlier = [
      message('a', 'first', '2026-09-29T10:00:00.000Z'),
      message('b', 'second', '2026-09-29T10:01:00.000Z'),
    ];

    expect(prependEarlierMessages(onScreen, earlier).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(prependEarlierMessages(onScreen, [])).toBe(onScreen);
  });
});
