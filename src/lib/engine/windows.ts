/**
 * Smart response-window suggestions: the closer the event, the shorter
 * the window, so cascades resolve before the moment passes.
 */

const MINUTE = 1;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface WindowRule {
  maxLeadMinutes: number;
  windowMinutes: number;
  label: string;
}

const RULES: WindowRule[] = [
  { maxLeadMinutes: 3 * HOUR, windowMinutes: 15, label: '15 minutes' },
  { maxLeadMinutes: 24 * HOUR, windowMinutes: HOUR, label: '1 hour' },
  { maxLeadMinutes: 3 * DAY, windowMinutes: 4 * HOUR, label: '4 hours' },
  { maxLeadMinutes: 7 * DAY, windowMinutes: DAY, label: '1 day' },
  { maxLeadMinutes: 30 * DAY, windowMinutes: 3 * DAY, label: '3 days' },
];
const FALLBACK: WindowRule = {
  maxLeadMinutes: Number.POSITIVE_INFINITY,
  windowMinutes: 7 * DAY,
  label: '1 week',
};

export function suggestWindow(eventStart: Date, now: Date): {
  windowMinutes: number;
  label: string;
} {
  const leadMinutes = Math.max(
    0,
    (eventStart.getTime() - now.getTime()) / 60_000,
  );
  const rule = RULES.find((r) => leadMinutes <= r.maxLeadMinutes) ?? FALLBACK;
  return { windowMinutes: rule.windowMinutes, label: rule.label };
}

export const WINDOW_CHOICES = [
  { windowMinutes: 15, label: '15 minutes' },
  { windowMinutes: 30, label: '30 minutes' },
  { windowMinutes: HOUR, label: '1 hour' },
  { windowMinutes: 4 * HOUR, label: '4 hours' },
  { windowMinutes: DAY, label: '1 day' },
  { windowMinutes: 3 * DAY, label: '3 days' },
  { windowMinutes: 7 * DAY, label: '1 week' },
] as const;
