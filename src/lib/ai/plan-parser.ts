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

/** A calendar date as YYYY-MM-DD, read in UTC (the day arithmetic below is zone-free). */
function toDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * The date it is for the person describing the plan, as YYYY-MM-DD.
 *
 * "Tomorrow" and "tonight" mean the host's tomorrow and tonight. The server
 * runs in UTC, so reading the date there turned "drinks tonight" said at 7pm in
 * California into tomorrow's date (G26). The browser sends its zone; a missing
 * or unrecognised one falls back to UTC rather than failing the draft.
 */
export function localToday(now: Date, timeZone: string | null | undefined): string {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  if (timeZone) {
    try {
      return format(timeZone);
    } catch {
      // An unknown zone name throws a RangeError; fall through to UTC.
    }
  }
  return format('UTC');
}

/** YYYY-MM-DD → a Date at UTC midnight, for day arithmetic that no zone can shift. */
function fromDateString(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

/** The weekday name for a YYYY-MM-DD date, for the model's prompt. */
export function weekdayOf(day: string): string {
  const name = WEEKDAYS[fromDateString(day).getUTCDay()];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Resolve a relative date phrase ("tomorrow", "friday", "next tuesday") against
 * `today`, the host's own date (see `localToday`). Returns YYYY-MM-DD or null.
 * Deterministic — no model, no key required — so "Describe it for me" still
 * fills the date when ANTHROPIC_API_KEY is absent.
 */
export function extractDate(text: string, today: string): string | null {
  const lower = text.toLowerCase();
  const base = fromDateString(today);

  if (/\btoday\b|\btonight\b/.test(lower)) return toDateString(base);
  if (/\btomorrow\b|\btmrw\b/.test(lower)) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + 1);
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
    const d = new Date(base);
    let delta = (i - d.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7; // "monday" said on a Monday means next Monday
    if (m[1]) delta += delta <= 6 ? 7 : 0; // explicit "next"
    d.setUTCDate(d.getUTCDate() + delta);
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
 * Pull a place from "at The Rusty Spoon" / "in Brooklyn". Takes a run of
 * capitalised words after at/in/@ and stops before a time or date word, so
 * "at 7pm" and "at 8" never read as a place.
 */
export function extractLocation(text: string): string | null {
  const match = text.match(
    /(?:\bat|\bin|@)\s+((?:the\s+)?[A-Z][\w'’&.-]*(?:\s+(?:of\s+|the\s+|&\s+)?[A-Z][\w'’&.-]*){0,4})/,
  );
  if (!match) return null;
  const place = match[1].trim().replace(/[.,]+$/, '');
  if (WEEKDAYS.includes(place.toLowerCase())) return null;
  return place.slice(0, 80) || null;
}

/**
 * No-key fallback: title from the text, invitees by fuzzy name match, plus a
 * best-effort date/time/mode extracted with deterministic rules so the draft
 * isn't empty when ANTHROPIC_API_KEY is unset.
 */
function parseWithRules(
  text: string,
  friendNames: string[],
  today: string,
): ParsedPlan {
  const lower = text.toLowerCase();
  const inviteeNames = friendNames.filter((name) => {
    const first = name.split(' ')[0].toLowerCase();
    return first.length > 2 && lower.includes(first);
  });
  return {
    title: text.split(/[,.]/)[0].slice(0, 60).trim() || 'New plan',
    date: extractDate(text, today),
    time: extractTime(text),
    locationName: extractLocation(text),
    capacity: null,
    inviteeNames,
    mode: extractMode(text),
  };
}

/**
 * `today` is the host's own date (YYYY-MM-DD, from `localToday`), so a
 * relative date resolves to the day they meant.
 */
export async function parsePlan(
  text: string,
  friendNames: string[],
  today: string,
): Promise<ParsedPlan> {
  if (!aiEnabled()) return parseWithRules(text, friendNames, today);

  try {
    const response = await getClaude().messages.create({
      model: MODELS.fast,
      max_tokens: 500,
      system:
        `You turn a spoken or typed plan description into a structured draft. ` +
        `Today is ${today} (${weekdayOf(today)}). ` +
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
    if (!toolUse || toolUse.type !== 'tool_use') return parseWithRules(text, friendNames, today);
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
    return parseWithRules(text, friendNames, today);
  }
}
