import { aiEnabled, getClaude, MODELS } from './claude';
import { describeCompany, DISCOVERY_BUDGETS, isSolo } from './discovery-options';
import { reportOperationalError } from '@/lib/server/observability';

/**
 * What the reader is told when the ideas are the built-in starters (D25). It
 * never mentions API keys or configuration: that is the operator's business,
 * and the reader can do nothing with it.
 */
export const FALLBACK_NOTICE =
  'Tailored ideas are unavailable right now; here are a few starters.';

/** Suggestions, and whether they were tailored or are the starters. */
export interface DiscoveryResult {
  suggestions: Suggestion[];
  /** False when these are the built-in starters: show {@link FALLBACK_NOTICE}. */
  tailored: boolean;
}

export interface DiscoveryInput {
  location: string;
  distanceMiles: number;
  when: string;
  budget: string;
  /** One of `GROUP_SIZES`; anything else is normalised to the default. */
  groupSize: string;
  /**
   * Whether meeting people they don't already know is welcome. Optional so a
   * stale client bundle reads as "no" rather than sending strangers along.
   */
  openToMeeting?: boolean;
  /** Zero or more vibes; empty means "open to any vibe". */
  vibes: string[];
  interests: string[];
}

export interface Suggestion {
  title: string;
  description: string;
  /** "Why this" - every recommendation explains itself. */
  why: string;
  category: string;
  estimatedCost: string;
}

const SUGGEST_TOOL = {
  name: 'recommend_activities',
  description: 'Return curated activity recommendations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            why: { type: 'string', description: 'One sentence: why this fits THIS request' },
            category: { type: 'string' },
            estimatedCost: { type: 'string' },
          },
          required: ['title', 'description', 'why', 'category', 'estimatedCost'],
        },
      },
    },
    required: ['suggestions'],
  },
};

interface FallbackPick extends Suggestion {
  /** Turning up on your own is normal here - no companion required. */
  solo: boolean;
  /** Meeting someone you don't know is a natural part of it. */
  social: boolean;
  /** The vibe chips this fits (`DISCOVERY_VIBES`). */
  vibes: string[];
  /** Lower-case words an interest can match. */
  topics: string[];
}

const FALLBACK_POOL: FallbackPick[] = [
  {
    title: 'Progressive dinner walk',
    description:
      'Appetizers at one spot, mains at another, dessert somewhere new. Three mini-adventures in one evening.',
    why: 'Casual, social, and easy to size up or down for your group.',
    category: 'Food',
    estimatedCost: '$$',
    solo: false,
    social: false,
    vibes: ['Lively', 'Adventurous'],
    topics: ['food', 'dining', 'restaurants', 'cooking', 'walking'],
  },
  {
    title: 'Local live-music night',
    description:
      'Most towns have a bar, brewery, or coffee shop with a weekly act. Low commitment, good atmosphere.',
    why: 'A relaxed shared focus takes the pressure off conversation.',
    category: 'Music',
    estimatedCost: '$',
    solo: true,
    social: true,
    vibes: ['Lively', 'Relaxed'],
    topics: ['music', 'concerts', 'live music', 'bands', 'jazz'],
  },
  {
    title: 'Golden-hour walk + coffee',
    description: 'A neighborhood loop that ends at a café. The classic for a reason.',
    why: 'Works for any budget and almost any energy level.',
    category: 'Outdoors',
    estimatedCost: '$',
    solo: true,
    social: false,
    vibes: ['Relaxed', 'Quiet', 'Cozy'],
    topics: ['walking', 'coffee', 'outdoors', 'nature', 'photography'],
  },
  {
    title: 'Board-game café takeover',
    description: 'Claim a big table, order snacks, and let the games do the socializing.',
    why: 'Great for mixed groups where not everyone knows each other.',
    category: 'Games',
    estimatedCost: '$',
    solo: false,
    social: true,
    vibes: ['Cozy', 'Lively'],
    topics: ['games', 'board games', 'coffee', 'trivia'],
  },
  {
    title: 'Farmers market brunch mission',
    description: 'Everyone buys one ingredient or ready-made item; assemble brunch together after.',
    why: 'Turns errands into an event - spontaneous and cheap.',
    category: 'Food',
    estimatedCost: '$',
    solo: false,
    social: false,
    vibes: ['Relaxed', 'Cozy'],
    topics: ['food', 'cooking', 'markets', 'brunch'],
  },
  {
    title: 'Counter seat at a busy kitchen',
    description:
      'Eat at the bar rather than a table. The cooks are right there, service is quicker, and a neighbour to talk to is optional.',
    why: 'A table for one never feels like one at the counter.',
    category: 'Food',
    estimatedCost: '$$',
    solo: true,
    social: true,
    vibes: ['Lively', 'Cozy'],
    topics: ['food', 'dining', 'restaurants', 'cooking'],
  },
  {
    title: 'Drop-in class you have never taken',
    description:
      'Pottery, climbing, improv, salsa - the beginner slot is a room of people equally out of their depth.',
    why: 'Everyone arrives on their own, so nobody is arriving alone.',
    category: 'Learning',
    estimatedCost: '$$',
    solo: true,
    social: true,
    vibes: ['Adventurous', 'Lively'],
    topics: ['art', 'pottery', 'climbing', 'dance', 'fitness', 'learning', 'improv'],
  },
  {
    title: 'Volunteer shift',
    description:
      'Trail crew, food bank, community garden - a couple of hours of useful work alongside people you have not met.',
    why: 'Shared work makes conversation easy and nobody has to host it.',
    category: 'Community',
    estimatedCost: 'Free',
    solo: true,
    social: true,
    vibes: ['Adventurous', 'Relaxed'],
    topics: ['volunteering', 'community', 'outdoors', 'gardening'],
  },
  {
    title: 'Bookstore hour, then a long coffee',
    description: 'Browse with no list, buy one thing, read it somewhere with a good window.',
    why: 'Unhurried and cheap - genuinely better on your own.',
    category: 'Quiet',
    estimatedCost: '$',
    solo: true,
    social: false,
    vibes: ['Quiet', 'Cozy', 'Relaxed'],
    topics: ['books', 'reading', 'coffee', 'writing'],
  },
];

/** Where a cost label sits on the budget scale, cheapest first. */
function costRank(cost: string): number {
  if (/free/i.test(cost)) return 0;
  const dollars = (cost.match(/\$/g) ?? []).length;
  return dollars > 0 ? dollars : DISCOVERY_BUDGETS.length;
}

function budgetRank(budget: string): number {
  const rank = (DISCOVERY_BUDGETS as readonly string[]).indexOf(budget);
  return rank === -1 ? DISCOVERY_BUDGETS.length : rank;
}

/**
 * The built-in starters, fitted to the search where that's cheap: nothing over
 * the budget, and picks that match a chosen vibe or a stated interest first.
 * Solo searches drop companion-only picks; "open to meeting people" floats the
 * sociable ones up. Always returns something — it is what the reader gets when
 * tailored ideas are unavailable, and an empty answer would read as "nothing
 * fits you".
 */
function fallbackSuggestions(input: DiscoveryInput): Suggestion[] {
  const company = isSolo(input.groupSize)
    ? FALLBACK_POOL.filter((pick) => pick.solo)
    : FALLBACK_POOL;
  const ceiling = budgetRank(input.budget);
  const affordable = company.filter((pick) => costRank(pick.estimatedCost) <= ceiling);
  // A "Free" budget with nothing free left would otherwise answer with
  // nothing; the cheapest of the rest beats an empty screen.
  const pool =
    affordable.length > 0
      ? affordable
      : [...company].sort((a, b) => costRank(a.estimatedCost) - costRank(b.estimatedCost)).slice(0, 2);

  const vibes = new Set(input.vibes.map((vibe) => vibe.toLowerCase()));
  // Short tags ("art", "tv") are fine; single letters would match everything.
  const interests = input.interests
    .map((interest) => interest.toLowerCase().trim())
    .filter((interest) => interest.length >= 2);
  const score = (pick: FallbackPick) => {
    let points = 0;
    if (pick.vibes.some((vibe) => vibes.has(vibe.toLowerCase()))) points += 2;
    if (
      interests.some((interest) =>
        pick.topics.some((topic) => topic.includes(interest) || interest.includes(topic)),
      )
    ) {
      points += 3;
    }
    if (input.openToMeeting && pick.social) points += 1;
    return points;
  };
  // Stable: equal scores keep the pool's own order.
  const ranked = pool
    .map((pick, index) => ({ pick, index, points: score(pick) }))
    .sort((a, b) => b.points - a.points || a.index - b.index)
    .map(({ pick }) => pick);

  return ranked.slice(0, 4).map((pick) => ({
    title: pick.title,
    description: pick.description,
    category: pick.category,
    estimatedCost: pick.estimatedCost,
    why: pick.why,
  }));
}

function starters(input: DiscoveryInput): DiscoveryResult {
  return { suggestions: fallbackSuggestions(input), tailored: false };
}

/**
 * Tailored activity ideas, or the starters when tailoring is unavailable. A
 * failed model call is logged with SB-DISCOVERY-RUN — it used to be swallowed,
 * so a broken key or an outage looked exactly like a working deployment — and
 * the reader still gets ideas, with the notice rather than an error.
 */
export async function discoverActivities(
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  if (!aiEnabled()) return starters(input);

  try {
    const response = await getClaude().messages.create({
      model: MODELS.smart,
      max_tokens: 1500,
      system:
        'You are Switchboard’s activity curator. Recommend 3-5 specific, ' +
        'realistic activities the person could actually do - on their own or ' +
        'with the company they described. Prefer concrete, ' +
        'locally-plausible ideas over generic ones; never invent specific venue ' +
        'names or events you cannot verify - describe the kind of place instead ' +
        '(e.g. "a brewery with a patio"). Each needs a one-sentence "why" tied ' +
        'to the stated preferences. Match the budget and vibe.',
      tools: [SUGGEST_TOOL],
      tool_choice: { type: 'tool', name: 'recommend_activities' },
      messages: [
        {
          role: 'user',
          content: [
            `Location: ${input.location || 'not specified'}`,
            `Willing to travel: ${input.distanceMiles} miles`,
            `When: ${input.when || 'flexible'}`,
            `Budget: ${input.budget}`,
            describeCompany(input.groupSize, Boolean(input.openToMeeting)),
            `Vibe: ${input.vibes.join(', ') || 'open to any vibe'}`,
            `Interests: ${input.interests.join(', ') || 'open to anything'}`,
          ].join('\n'),
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      await reportOperationalError(
        'discovery.run',
        new Error('model returned no tool call'),
        { stopReason: response.stop_reason },
        'SB-DISCOVERY-RUN',
      );
      return starters(input);
    }
    const parsed = toolUse.input as { suggestions?: Suggestion[] };
    const suggestions = (Array.isArray(parsed.suggestions) ? parsed.suggestions : []).filter(
      (s) => s && typeof s.title === 'string' && s.title,
    );
    return suggestions.length > 0
      ? { suggestions: suggestions.slice(0, 5), tailored: true }
      : starters(input);
  } catch (error) {
    await reportOperationalError('discovery.run', error, {}, 'SB-DISCOVERY-RUN');
    return starters(input);
  }
}
