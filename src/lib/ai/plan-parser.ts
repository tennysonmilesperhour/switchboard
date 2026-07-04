import { aiEnabled, getClaude, MODELS } from './claude';

export interface ParsedPlan {
  title: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM (24h)
  locationName: string | null;
  capacity: number | null;
  inviteeNames: string[]; // in priority order
  mode: 'individual' | 'group' | 'all_at_once';
}

const PARSE_TOOL = {
  name: 'draft_plan',
  description: 'Draft a structured plan from a natural-language description.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short plan title, e.g. "Coffee downtown"' },
      date: { type: 'string', description: 'YYYY-MM-DD, resolved from relative phrases' },
      time: { type: 'string', description: 'HH:MM 24-hour' },
      locationName: { type: 'string' },
      capacity: { type: 'number' },
      inviteeNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'People to invite, IN THE ORDER STATED (order = cascade priority)',
      },
      mode: { type: 'string', enum: ['individual', 'group', 'all_at_once'] },
    },
    required: ['title', 'inviteeNames', 'mode'],
  },
};

/** No-key fallback: title from the text, invitees by fuzzy name match. */
function parseWithRules(text: string, friendNames: string[]): ParsedPlan {
  const lower = text.toLowerCase();
  const inviteeNames = friendNames.filter((name) => {
    const first = name.split(' ')[0].toLowerCase();
    return first.length > 2 && lower.includes(first);
  });
  return {
    title: text.split(/[,.]/)[0].slice(0, 60).trim() || 'New plan',
    date: null,
    time: null,
    locationName: null,
    capacity: null,
    inviteeNames,
    mode: 'individual',
  };
}

export async function parsePlan(
  text: string,
  friendNames: string[],
  now: Date,
): Promise<ParsedPlan> {
  if (!aiEnabled()) return parseWithRules(text, friendNames);

  try {
    const response = await getClaude().messages.create({
      model: MODELS.fast,
      max_tokens: 500,
      system:
        `You turn a spoken or typed plan description into a structured draft. ` +
        `Today is ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString('en-US', { weekday: 'long' })}). ` +
        `Resolve relative dates ("tomorrow", "Friday") to YYYY-MM-DD. ` +
        `Invitee names must come from this list when they clearly match: ` +
        `${friendNames.join(', ') || '(no friends yet)'}. Keep their stated order; ` +
        `phrases like "try Alex first, then Jordan" mean cascade priority. ` +
        `"one at a time" or naming a fallback order implies mode=individual; ` +
        `"everyone"/"all of them" implies all_at_once. Never invent people.`,
      tools: [PARSE_TOOL],
      tool_choice: { type: 'tool', name: 'draft_plan' },
      messages: [{ role: 'user', content: text }],
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return parseWithRules(text, friendNames);
    const raw = toolUse.input as Partial<ParsedPlan>;
    return {
      title: raw.title?.slice(0, 80) || 'New plan',
      date: raw.date ?? null,
      time: raw.time ?? null,
      locationName: raw.locationName ?? null,
      capacity: typeof raw.capacity === 'number' ? raw.capacity : null,
      inviteeNames: (raw.inviteeNames ?? []).filter((name) =>
        friendNames.some((f) => f.toLowerCase() === name.toLowerCase()),
      ),
      mode: raw.mode ?? 'individual',
    };
  } catch {
    return parseWithRules(text, friendNames);
  }
}
