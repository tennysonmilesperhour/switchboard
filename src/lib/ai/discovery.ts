import { aiEnabled, getClaude, MODELS } from './claude';

export interface DiscoveryInput {
  location: string;
  distanceMiles: number;
  when: string;
  budget: string;
  groupSize: string;
  vibe: string;
  interests: string[];
}

export interface Suggestion {
  title: string;
  description: string;
  /** "Why this" — every recommendation explains itself. */
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

/** Curated fallback so Discovery works before an API key is configured. */
function fallbackSuggestions(input: DiscoveryInput): Suggestion[] {
  const pool: Suggestion[] = [
    {
      title: 'Progressive dinner walk',
      description:
        'Appetizers at one spot, mains at another, dessert somewhere new. Three mini-adventures in one evening.',
      why: 'Casual, social, and easy to size up or down for your group.',
      category: 'Food',
      estimatedCost: '$$',
    },
    {
      title: 'Local live-music night',
      description:
        'Most towns have a bar, brewery, or coffee shop with a weekly act. Low commitment, good atmosphere.',
      why: 'A relaxed shared focus takes the pressure off conversation.',
      category: 'Music',
      estimatedCost: '$',
    },
    {
      title: 'Golden-hour walk + coffee',
      description: 'A neighborhood loop that ends at a café. The classic for a reason.',
      why: 'Works for any budget and almost any energy level.',
      category: 'Outdoors',
      estimatedCost: '$',
    },
    {
      title: 'Board-game café takeover',
      description: 'Claim a big table, order snacks, and let the games do the socializing.',
      why: 'Great for mixed groups where not everyone knows each other.',
      category: 'Games',
      estimatedCost: '$',
    },
    {
      title: 'Farmers market brunch mission',
      description: 'Everyone buys one ingredient or ready-made item; assemble brunch together after.',
      why: 'Turns errands into an event — spontaneous and cheap.',
      category: 'Food',
      estimatedCost: '$',
    },
  ];
  return pool.slice(0, 4).map((s) => ({
    ...s,
    why: `${s.why} (Curated pick — connect an Anthropic key for suggestions tailored to ${input.location || 'your area'}.)`,
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
        'You are Switchboard’s activity curator. Recommend 3–5 specific, ' +
        'realistic activities a small group could actually do. Prefer concrete, ' +
        'locally-plausible ideas over generic ones; never invent specific venue ' +
        'names or events you cannot verify — describe the kind of place instead ' +
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
            `Group size: ${input.groupSize}`,
            `Vibe: ${input.vibe}`,
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
