import { aiEnabled, getClaude, MODELS } from './claude';
import { describeCompany, isSolo } from './discovery-options';

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
  },
  {
    title: 'Golden-hour walk + coffee',
    description: 'A neighborhood loop that ends at a café. The classic for a reason.',
    why: 'Works for any budget and almost any energy level.',
    category: 'Outdoors',
    estimatedCost: '$',
    solo: true,
    social: false,
  },
  {
    title: 'Board-game café takeover',
    description: 'Claim a big table, order snacks, and let the games do the socializing.',
    why: 'Great for mixed groups where not everyone knows each other.',
    category: 'Games',
    estimatedCost: '$',
    solo: false,
    social: true,
  },
  {
    title: 'Farmers market brunch mission',
    description: 'Everyone buys one ingredient or ready-made item; assemble brunch together after.',
    why: 'Turns errands into an event - spontaneous and cheap.',
    category: 'Food',
    estimatedCost: '$',
    solo: false,
    social: false,
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
  },
  {
    title: 'Bookstore hour, then a long coffee',
    description: 'Browse with no list, buy one thing, read it somewhere with a good window.',
    why: 'Unhurried and cheap - genuinely better on your own.',
    category: 'Quiet',
    estimatedCost: '$',
    solo: true,
    social: false,
  },
];

/** Curated fallback so Discovery works before an API key is configured. */
function fallbackSuggestions(input: DiscoveryInput): Suggestion[] {
  const eligible = isSolo(input.groupSize)
    ? FALLBACK_POOL.filter((pick) => pick.solo)
    : FALLBACK_POOL;
  // Stable sort: "open to meeting people" floats the sociable picks up without
  // reshuffling the rest.
  const ranked = input.openToMeeting
    ? [...eligible].sort((a, b) => Number(b.social) - Number(a.social))
    : eligible;

  return ranked.slice(0, 4).map((pick) => ({
    title: pick.title,
    description: pick.description,
    category: pick.category,
    estimatedCost: pick.estimatedCost,
    why: `${pick.why} (Curated pick - connect an Anthropic key for suggestions tailored to ${input.location || 'your area'}.)`,
  }));
}

export async function discoverActivities(
  input: DiscoveryInput,
): Promise<Suggestion[]> {
  if (!aiEnabled()) return fallbackSuggestions(input);

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
    if (!toolUse || toolUse.type !== 'tool_use') return fallbackSuggestions(input);
    const parsed = toolUse.input as { suggestions?: Suggestion[] };
    const suggestions = (parsed.suggestions ?? []).filter((s) => s.title);
    return suggestions.length > 0 ? suggestions.slice(0, 5) : fallbackSuggestions(input);
  } catch {
    return fallbackSuggestions(input);
  }
}
