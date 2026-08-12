import { describe, expect, it } from 'vitest';
import {
  POLL_TOPICS,
  SUGGESTED_FOLLOW_UPS,
  pollQuestion,
  type Poll,
  type PollTopic,
} from '@/lib/types';

/**
 * The vocabulary that decides what a follow-up poll is called and what the app
 * offers to ask next. These are the parts a call site can get wrong silently —
 * a topic with no question renders a blank heading, and a suggested follow-up
 * pointing at a topic that doesn't exist renders an empty chip row.
 */
describe('poll topics', () => {
  it('gives every topic a question, so no poll renders a blank heading', () => {
    for (const entry of POLL_TOPICS) {
      expect(entry.question.trim(), `${entry.topic} needs a question`).not.toBe('');
      expect(entry.label.trim()).not.toBe('');
      expect(entry.emoji.trim()).not.toBe('');
    }
  });

  it('only suggests follow-ups that are real topics', () => {
    const known = new Set(POLL_TOPICS.map((entry) => entry.topic));
    for (const [topic, followUps] of Object.entries(SUGGESTED_FOLLOW_UPS)) {
      expect(known.has(topic as PollTopic), `${topic} is not a topic`).toBe(true);
      for (const next of followUps) {
        expect(known.has(next), `${topic} suggests unknown ${next}`).toBe(true);
      }
      expect(followUps.length, `${topic} needs at least one suggestion`).toBeGreaterThan(0);
    }
  });

  it('covers every topic, so a host is never offered nothing', () => {
    for (const entry of POLL_TOPICS) {
      expect(SUGGESTED_FOLLOW_UPS[entry.topic]).toBeDefined();
    }
  });

  it('suggests the order plans actually get made in', () => {
    // The date gates everything else, so it must not be suggested as a
    // follow-up to anything — a plan that picks the restaurant and then asks
    // what day it is has the chain backwards.
    for (const followUps of Object.values(SUGGESTED_FOLLOW_UPS)) {
      expect(followUps).not.toContain('date');
    }
    expect(SUGGESTED_FOLLOW_UPS.date).toContain('place');
  });
});

describe('pollQuestion', () => {
  function poll(topic: PollTopic, title: string | null): Pick<Poll, 'topic' | 'title'> {
    return { topic, title };
  }

  it('uses the host’s own words when they wrote some', () => {
    expect(pollQuestion(poll('custom', 'Who is driving?'))).toBe('Who is driving?');
  });

  it('falls back to the topic’s question when there is no title', () => {
    expect(pollQuestion(poll('date', null))).toBe('When should this be?');
    expect(pollQuestion(poll('food', null))).toBe('What are we eating?');
  });

  it('treats a whitespace-only title as no title, not as a blank heading', () => {
    expect(pollQuestion(poll('place', '   '))).toBe('Where should we go?');
  });

  it('trims a title rather than rendering the host’s stray spaces', () => {
    expect(pollQuestion(poll('custom', '  Bring what?  '))).toBe('Bring what?');
  });
});
