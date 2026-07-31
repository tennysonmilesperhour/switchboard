import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { discoverActivities, type DiscoveryInput } from './discovery';

// With no key configured, discovery returns the curated fallback without ever
// touching the network - which is exactly the path this exercises.
beforeEach(() => vi.stubEnv('ANTHROPIC_API_KEY', ''));
afterEach(() => vi.unstubAllEnvs());

const base: DiscoveryInput = {
  location: 'Sugarhouse, UT',
  distanceMiles: 15,
  when: 'Friday evening',
  budget: '$$',
  groupSize: 'Just us two',
  vibes: [],
  interests: [],
};

const COMPANION_ONLY = [
  'Progressive dinner walk',
  'Board-game café takeover',
  'Farmers market brunch mission',
];

describe('fallback suggestions', () => {
  it('drops companion-only picks for a solo search', async () => {
    const suggestions = await discoverActivities({ ...base, groupSize: 'Just me' });
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(COMPANION_ONLY).not.toContain(suggestion.title);
    }
  });

  it('leads with sociable picks when open to meeting people', async () => {
    const suggestions = await discoverActivities({
      ...base,
      groupSize: 'Just me',
      openToMeeting: true,
    });
    expect(suggestions[0].title).not.toBe('Golden-hour walk + coffee');
    expect(suggestions.map((s) => s.title)).toContain('Drop-in class you have never taken');
  });

  it('leaves a solo search that wants its own company un-nudged', async () => {
    const suggestions = await discoverActivities({ ...base, groupSize: 'Just me' });
    expect(suggestions.map((s) => s.title)).toContain('Golden-hour walk + coffee');
  });

  it('still serves group searches the group picks', async () => {
    const suggestions = await discoverActivities(base);
    expect(suggestions.map((s) => s.title)).toContain('Progressive dinner walk');
  });
});
