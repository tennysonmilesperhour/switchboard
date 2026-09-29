import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const reportOperationalError = vi.hoisted(() => vi.fn(async () => undefined));
const create = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/observability', () => ({ reportOperationalError }));
vi.mock('./claude', () => ({
  aiEnabled: () => Boolean(process.env.ANTHROPIC_API_KEY),
  getClaude: () => ({ messages: { create } }),
  MODELS: { smart: 'test-model' },
}));

import { discoverActivities, FALLBACK_NOTICE, type DiscoveryInput } from './discovery';

// With no key configured, discovery returns the starters without ever touching
// the network - which is exactly the path most of this exercises.
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});
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

async function titles(input: DiscoveryInput): Promise<string[]> {
  return (await discoverActivities(input)).suggestions.map((s) => s.title);
}

describe('starter suggestions', () => {
  it('are marked as not tailored, so the reader is told (D25)', async () => {
    const result = await discoverActivities(base);
    expect(result.tailored).toBe(false);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('never mention API keys or configuration', async () => {
    const result = await discoverActivities(base);
    const copy = [FALLBACK_NOTICE, ...result.suggestions.flatMap((s) => [s.why, s.description])]
      .join(' ')
      .toLowerCase();
    expect(copy).not.toMatch(/anthropic|api key|\bkey\b|configur/);
    expect(FALLBACK_NOTICE).toBe(
      'Tailored ideas are unavailable right now; here are a few starters.',
    );
  });

  it('drops companion-only picks for a solo search', async () => {
    for (const title of await titles({ ...base, groupSize: 'Just me' })) {
      expect(COMPANION_ONLY).not.toContain(title);
    }
  });

  it('leads with sociable picks when open to meeting people', async () => {
    const picked = await titles({ ...base, groupSize: 'Just me', openToMeeting: true });
    expect(picked[0]).not.toBe('Golden-hour walk + coffee');
    expect(picked).toContain('Drop-in class you have never taken');
  });

  it('leaves a solo search that wants its own company un-nudged', async () => {
    expect(await titles({ ...base, groupSize: 'Just me' })).toContain('Golden-hour walk + coffee');
  });

  it('still serves group searches the group picks', async () => {
    expect(await titles(base)).toContain('Progressive dinner walk');
  });

  it('keeps to the budget', async () => {
    const result = await discoverActivities({ ...base, budget: '$' });
    for (const suggestion of result.suggestions) {
      expect(['Free', '$']).toContain(suggestion.estimatedCost);
    }
    const free = await discoverActivities({ ...base, budget: 'Free' });
    expect(free.suggestions.length).toBeGreaterThan(0);
  });

  it('puts a matching vibe first', async () => {
    const picked = await titles({ ...base, vibes: ['Quiet'] });
    expect(['Golden-hour walk + coffee', 'Bookstore hour, then a long coffee']).toContain(picked[0]);
  });

  it('puts a matching interest first', async () => {
    expect((await titles({ ...base, interests: ['Books'] }))[0]).toBe(
      'Bookstore hour, then a long coffee',
    );
    expect((await titles({ ...base, interests: ['music'] }))[0]).toBe('Local live-music night');
  });
});

describe('tailored suggestions', () => {
  beforeEach(() => vi.stubEnv('ANTHROPIC_API_KEY', 'test-key'));

  it('come back tailored when the model answers', async () => {
    create.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          input: {
            suggestions: [
              { title: 'Sunset kayak', description: 'd', why: 'w', category: 'c', estimatedCost: '$$' },
            ],
          },
        },
      ],
    });
    const result = await discoverActivities(base);
    expect(result).toMatchObject({ tailored: true, suggestions: [{ title: 'Sunset kayak' }] });
    expect(reportOperationalError).not.toHaveBeenCalled();
  });

  it('log a failed model call with SB-DISCOVERY-RUN and fall back to starters', async () => {
    create.mockRejectedValueOnce(new Error('overloaded'));
    const result = await discoverActivities(base);
    expect(result.tailored).toBe(false);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(reportOperationalError).toHaveBeenCalledWith(
      'discovery.run',
      expect.any(Error),
      {},
      'SB-DISCOVERY-RUN',
    );
  });
});
