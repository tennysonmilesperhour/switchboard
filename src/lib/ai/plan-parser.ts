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

const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Resolve a relative date phrase ("tomorrow", "friday", "next tuesday") against
 * `now`, in `now`'s local zone. Returns YYYY-MM-DD or null. Deterministic — no
 * model, no key required — so "Describe it for me" still fills the date when
 * ANTHROPIC_API_KEY is absent.
 */
export function extractDate(text: string, now: Date): string | null {
  const lower = text.toLowerCase();

  if (/\btoday\b|\btonight\b/.test(lower)) return toDateString(now);
  if (/\btomorrow\b|\btmrw\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toDateString(d);
  }

  // Explicit ISO date, e.g. "2026-07-20".
  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // A weekday name → the next occurrence of that weekday. "next friday" pushes
  // a further week out when the nearest one is within six days.
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const re = new RegExp(`\\b(next\\s+)?${WEEKDAYS[i]}\\b`);
    const m = lower.match(re);
    if (!m) continue;
    const d = new Date(now);
    let delta = (i - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // "monday" said on a Monday means next Monday
    if (m[1]) delta += delta <= 6 ? 7 : 0; // explicit "next"
    d.setDate(d.getDate() + delta);
    return toDateString(d);
  }

  return null;
}

/**
 * Pull a wall-clock time from free text: "7pm", "7:30 pm", "at 8", "19:00".
 * Returns HH:MM (24h) or null.
 */
export function extractTime(text: string): string | null {
  const lower = text.toLowerCase();

  // 12-hour with am/pm, optional minutes: "7pm", "7:30 pm".
  const twelve = lower.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/);
  if (twelve) {
    let hour = parseInt(twelve[1], 10) % 12;
    if (twelve[3] === 'pm') hour += 12;
    return `${pad2(hour)}:${twelve[2] ?? '00'}`;
  }

  // 24-hour "19:00" / "at 9:30".
  const h24 = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) return `${pad2(parseInt(h24[1], 10))}:${h24[2]}`;

  // Bare "at 8" → assume evening for a social plan (8 → 20:00; ≤ 11 pm).
  const bare = lower.match(/\bat\s+(1[0-2]|0?[1-9])\b/);
  if (bare) {
    const raw = parseInt(bare[1], 10);
    const hour = raw >= 8 || raw <= 5 ? (raw % 12) + (raw <= 11 ? 12 : 0) : raw;
    return `${pad2(hour % 24)}:00`;
  }

  return null;
}

/** Keyword heuristic for cascade mode when no model is available. */
export function extractMode(text: string): ParsedPlan['mode'] {
  const lower = text.toLowerCase();
  if (/\ball at once\b|\beveryone\b|\ball of them\b|\bwhole (group|crew|list)\b/.test(lower)) {
    return 'all_at_once';
  }
  if (/\bin waves\b|\bin groups\b|\bin stages\b|\bin batches\b/.test(lower)) {
    return 'group';
  }
  // "one at a time", "first … then …", a fallback order → individual (default).
  return 'individual';
}

/**
 * No-key fallback: title from the text, invitees by fuzzy name match, plus a
 * best-effort date/time/mode extracted with deterministic rules so the draft
 * isn't empty when ANTHROPIC_API_KEY is unset.
 */
function parseWithRules(
  text: string,
  friendNames: string[],
  now: Date,
): ParsedPlan {
  const lower = text.toLowerCase();
  const inviteeNames = friendNames.filter((name) => {
    const first = name.split(' ')[0].toLowerCase();
    return first.length > 2 && lower.includes(first);
  });
  return {
    title: text.split(/[,.]/)[0].slice(0, 60).trim() || 'New plan',
    date: extractDate(text, now),
    time: extractTime(text),
    locationName: null,
    capacity: null,
    inviteeNames,
    mode: extractMode(text),
  };
}

export async function parsePlan(
  text: string,
  friendNames: string[],
  now: Date,
): Promise<ParsedPlan> {
  if (!aiEnabled()) return parseWithRules(text, friendNames, now);

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
    if (!toolUse || toolUse.type !== 'tool_use') return parseWithRules(text, friendNames, now);
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
    return parseWithRules(text, friendNames, now);
  }
}
