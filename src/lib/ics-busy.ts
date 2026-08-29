/**
 * Read the busy blocks out of a subscribed calendar.
 *
 * The mirror of `ics.ts`, which writes Switchboard's plans out as a feed. This
 * reads someone's own calendar back in, so the availability grid can start from
 * what their week already looks like instead of an empty board.
 *
 * ————————————————————————— what it takes out —————————————————————————
 *
 * Times, and nothing else. Not the title, not the location, not who else is
 * invited, not the description. A busy block here is a pair of instants; the
 * rest of the VEVENT is dropped where it is parsed and never reaches a caller,
 * so there is no layer above this that could leak it by accident. That is a
 * deliberate ceiling on what connecting a calendar can ever expose, and it
 * matches the promise the availability grid already makes: the group learns how
 * many people are free, never what anyone is doing.
 *
 * ————————————————————————— what counts as busy —————————————————————————
 *
 * `TRANSP:TRANSPARENT` events are skipped — that is the calendar's own word for
 * "this does not block me", and it is what most all-day entries (birthdays,
 * "out of office" banners, public holidays) are marked as. `STATUS:CANCELLED`
 * is skipped for the obvious reason.
 *
 * ————————————————————————— what it does not do —————————————————————————
 *
 * Recurrence is supported for the shapes people actually have in a given week —
 * DAILY, WEEKLY (with BYDAY), and MONTHLY on a fixed day-of-month, each with
 * INTERVAL, COUNT, UNTIL, and EXDATE. YEARLY and the byzantine end of RFC 5545
 * (BYSETPOS, BYWEEKNO, RDATE, VTIMEZONE-defined zones) are not expanded. The
 * cost of missing one is a slot that shows free when it is not, which the
 * person can see and correct — the prefill is a starting point they confirm,
 * never a silent answer, and that is what makes this subset an honest place to
 * stop rather than a lurking wrong number.
 */

export interface BusyInterval {
  /** Epoch ms, inclusive. */
  start: number;
  /** Epoch ms, exclusive. */
  end: number;
}

/** How much of a band has to be taken before the band reads as busy. */
const BUSY_SHARE = 0.5;

/** Refuse absurd inputs rather than expanding a hostile RRULE forever. */
const MAX_OCCURRENCES = 400;

/**
 * Undo RFC 5545 line folding.
 *
 * A long line is split with CRLF followed by a space or tab, and a naive
 * line-by-line parse silently truncates every long value — which for a calendar
 * means a DTSTART that parses and an RRULE that does not.
 */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

/** How far `zone` is ahead of UTC at a given instant, in ms. */
function zoneOffsetMs(atMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(atMs));
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Some ICU builds render midnight as hour 24; Date.UTC would roll that into
  // the next day and put the offset out by a day.
  const hour = at('hour') === 24 ? 0 : at('hour');
  const asUtc = Date.UTC(at('year'), at('month') - 1, at('day'), hour, at('minute'), at('second'));
  return asUtc - atMs;
}

/**
 * A wall-clock reading in a named zone, as a real instant.
 *
 * Done in two passes because the offset depends on the very instant we are
 * trying to find: interpreting the reading as UTC gives a usable guess, and
 * re-reading the offset there settles the hour that a DST boundary would
 * otherwise shift. Without the second pass every event in the days around a
 * clock change lands an hour out.
 */
function wallClockToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  zone: string | null,
): number {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const resolved = resolveZone(zone);
  if (!resolved) return naive;
  zone = resolved;
  try {
    const first = zoneOffsetMs(naive, zone);
    const corrected = naive - first;
    const second = zoneOffsetMs(corrected, zone);
    return second === first ? corrected : naive - second;
  } catch {
    // An unrecognised TZID (Intl throws) is better read as UTC than dropped —
    // a block in roughly the right place beats a week that looks emptier than
    // it is.
    return naive;
  }
}

interface IcsDate {
  ms: number;
  /** VALUE=DATE — a whole day, with no time of day attached. */
  allDay: boolean;
}

/** Parse `20260829T140000Z`, `20260829T080000` (+TZID), or `20260829`. */
function parseIcsDate(value: string, tzid: string | null): IcsDate | null {
  const clean = value.trim();
  const dateOnly = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return { ms: Date.UTC(Number(y), Number(mo) - 1, Number(d)), allDay: true };
  }
  const full = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!full) return null;
  const [, y, mo, d, h, mi, s, utc] = full;
  const ms = utc
    ? Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
    : wallClockToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s), tzid);
  return { ms, allDay: false };
}

/** `DTSTART;TZID=America/Denver:2026...` → name, params, value. */
function splitLine(line: string): { name: string; params: Map<string, string>; value: string } | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rawParams] = head.split(';');
  const params = new Map<string, string>();
  for (const param of rawParams) {
    const eq = param.indexOf('=');
    if (eq !== -1) params.set(param.slice(0, eq).toUpperCase(), param.slice(eq + 1).replace(/^"|"$/g, ''));
  }
  return { name: name.toUpperCase(), params, value };
}

const DAY_MS = 86_400_000;

/**
 * Exchange and Outlook write Windows zone names, which `Intl` has never heard
 * of. Left untranslated they throw, fall back to UTC, and put a 9am meeting
 * seven hours out — far enough to move it into a different band and a different
 * day. These are the names that actually appear in exported calendars; anything
 * unmapped still falls back to UTC, which is why `unresolvedZone` exists to say
 * so rather than quietly shifting someone's week.
 */
const WINDOWS_ZONES: Record<string, string> = {
  'pacific standard time': 'America/Los_Angeles',
  'mountain standard time': 'America/Denver',
  'us mountain standard time': 'America/Phoenix',
  'central standard time': 'America/Chicago',
  'eastern standard time': 'America/New_York',
  'alaskan standard time': 'America/Anchorage',
  'hawaiian standard time': 'Pacific/Honolulu',
  'atlantic standard time': 'America/Halifax',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'w. europe standard time': 'Europe/Berlin',
  'central europe standard time': 'Europe/Budapest',
  'central european standard time': 'Europe/Warsaw',
  'romance standard time': 'Europe/Paris',
  'e. europe standard time': 'Europe/Bucharest',
  'fle standard time': 'Europe/Kiev',
  'russian standard time': 'Europe/Moscow',
  'india standard time': 'Asia/Kolkata',
  'china standard time': 'Asia/Shanghai',
  'tokyo standard time': 'Asia/Tokyo',
  'korea standard time': 'Asia/Seoul',
  'singapore standard time': 'Asia/Singapore',
  'aus eastern standard time': 'Australia/Sydney',
  'new zealand standard time': 'Pacific/Auckland',
  'utc': 'UTC',
};

/** Map a TZID onto something Intl understands, or null if we cannot. */
function resolveZone(tzid: string | null): string | null {
  if (!tzid) return null;
  const mapped = WINDOWS_ZONES[tzid.trim().toLowerCase()];
  return mapped ?? tzid;
}
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface RawEvent {
  start: number;
  end: number;
  allDay: boolean;
  tzid: string | null;
  rrule: string | null;
  exdates: number[];
}

/**
 * Expand one event into the occurrences that land inside the window.
 *
 * Anchored on the event's own start rather than the window's, so an interval or
 * a count is measured from where the series actually began — a fortnightly
 * meeting must not re-phase itself just because someone looked at it in a
 * different week.
 */
function occurrences(event: RawEvent, windowStart: number, windowEnd: number): BusyInterval[] {
  const duration = Math.max(0, event.end - event.start);
  const out: BusyInterval[] = [];
  const push = (startMs: number) => {
    if (event.exdates.includes(startMs)) return;
    const endMs = startMs + duration;
    if (endMs > windowStart && startMs < windowEnd) out.push({ start: startMs, end: endMs });
  };

  if (!event.rrule) {
    push(event.start);
    return out;
  }

  const rule = new Map<string, string>();
  for (const part of event.rrule.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1) rule.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1).toUpperCase());
  }
  const freq = rule.get('FREQ') ?? '';
  const interval = Math.max(1, Number(rule.get('INTERVAL') ?? '1') || 1);
  const count = rule.get('COUNT') ? Number(rule.get('COUNT')) : null;
  const untilRaw = rule.get('UNTIL');
  const until = untilRaw ? parseIcsDate(untilRaw, event.tzid)?.ms ?? null : null;
  const byDay = (rule.get('BYDAY') ?? '')
    .split(',')
    .map((d) => d.trim().slice(-2))
    .filter((d) => WEEKDAYS.includes(d));

  /**
   * Where to start walking the series.
   *
   * A standup that began in 2020 must not be stepped through a day at a time
   * to reach this week — any sane iteration cap runs out first, and the week
   * would render empty, which is the one failure mode a busy calendar must not
   * have. With no COUNT the nth occurrence is arithmetic, so we jump straight
   * to the first one that could touch the window. COUNT is the exception: it
   * bounds the series itself, so walking from the start is both cheap and the
   * only way to know where the count runs out.
   */
  const skipSteps = (stepMs: number, origin: number): number =>
    count !== null ? 0 : Math.max(0, Math.floor((windowStart - duration - origin) / stepMs));

  /** Every reason to stop emitting, in one place. */
  const done = (index: number, ms: number): boolean =>
    (count !== null && index >= count) || (until !== null && ms > until) || ms >= windowEnd;

  if (freq === 'DAILY') {
    const step = interval * DAY_MS;
    let i = skipSteps(step, event.start);
    for (let guard = 0; guard < MAX_OCCURRENCES; guard += 1, i += 1) {
      const ms = event.start + i * step;
      if (done(i, ms)) break;
      push(ms);
    }
  } else if (freq === 'WEEKLY') {
    // Every weekday named by BYDAY, in each active week. A bare WEEKLY repeats
    // on the weekday the series started on.
    const days = byDay.length > 0 ? byDay : [WEEKDAYS[new Date(event.start).getUTCDay()]];
    const dayIndices = [...new Set(days.map((d) => WEEKDAYS.indexOf(d)))].sort((a, b) => a - b);
    const dayStart = Math.floor(event.start / DAY_MS) * DAY_MS;
    const timeOfDay = event.start - dayStart;
    const weekOne = dayStart - new Date(event.start).getUTCDay() * DAY_MS;
    const step = interval * 7 * DAY_MS;
    let index = 0;
    let week = skipSteps(step, weekOne);
    for (let guard = 0; guard < MAX_OCCURRENCES; guard += 1, week += 1) {
      const base = weekOne + week * step;
      if (base > windowEnd) break;
      let stopped = false;
      for (const day of dayIndices) {
        const ms = base + day * DAY_MS + timeOfDay;
        // The series cannot start before its own DTSTART, even when BYDAY
        // names a weekday earlier in that first week.
        if (ms < event.start) continue;
        if (done(index, ms)) {
          stopped = true;
          break;
        }
        index += 1;
        push(ms);
      }
      if (stopped) break;
    }
  } else if (freq === 'MONTHLY') {
    const anchor = new Date(event.start);
    const monthsOf = (ms: number) => {
      const d = new Date(ms);
      return d.getUTCFullYear() * 12 + d.getUTCMonth();
    };
    let i =
      count !== null
        ? 0
        : Math.max(0, Math.floor((monthsOf(windowStart) - monthsOf(event.start)) / interval));
    for (let guard = 0; guard < MAX_OCCURRENCES; guard += 1, i += 1) {
      const d = new Date(anchor);
      d.setUTCMonth(anchor.getUTCMonth() + i * interval);
      const ms = d.getTime();
      if (done(i, ms)) break;
      push(ms);
    }
  } else {
    // A frequency we do not expand still has its first occurrence.
    push(event.start);
  }

  return out;
}

/**
 * Every busy interval a calendar has inside `[windowStart, windowEnd)`.
 *
 * Pure: the network fetch lives in the server action, the same split
 * `import-event.ts` uses, so the parsing is unit-testable without a server.
 */
export function parseBusyIntervals(
  ics: string,
  windowStart: Date,
  windowEnd: Date,
): BusyInterval[] {
  const from = windowStart.getTime();
  const to = windowEnd.getTime();
  const lines = unfold(ics);
  const intervals: BusyInterval[] = [];

  let current: Partial<RawEvent> & { exdates: number[] } = { exdates: [] };
  let inEvent = false;
  let skip = false;
  // How deep inside a sub-component of the current VEVENT we are. A VALARM
  // carries its own DURATION, and without this it overwrites the event's: a
  // three-hour meeting with a reminder attached became a five-minute one, so
  // almost nothing in a real Google calendar registered as busy. Properties
  // only count at depth 0.
  let nested = 0;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      skip = false;
      nested = 0;
      current = { exdates: [] };
      continue;
    }
    if (!inEvent) continue;
    if (nested === 0 && upper.startsWith('END:VEVENT')) {
      if (inEvent && !skip && current.start !== undefined) {
        const event: RawEvent = {
          start: current.start,
          // No DTEND and no DURATION: an all-day entry covers its day, and a
          // timed one is a moment rather than a span.
          end: current.end ?? (current.allDay ? current.start + DAY_MS : current.start),
          allDay: current.allDay ?? false,
          tzid: current.tzid ?? null,
          rrule: current.rrule ?? null,
          exdates: current.exdates,
        };
        intervals.push(...occurrences(event, from, to));
      }
      inEvent = false;
      continue;
    }
    if (upper.startsWith('BEGIN:')) {
      nested += 1;
      continue;
    }
    if (upper.startsWith('END:')) {
      nested = Math.max(0, nested - 1);
      continue;
    }
    if (skip || nested > 0) continue;

    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;
    const tzid = params.get('TZID') ?? null;

    if (name === 'TRANSP' && value.trim().toUpperCase() === 'TRANSPARENT') skip = true;
    else if (name === 'STATUS' && value.trim().toUpperCase() === 'CANCELLED') skip = true;
    else if (name === 'DTSTART') {
      const date = parseIcsDate(value, tzid);
      if (date) {
        current.start = date.ms;
        current.allDay = date.allDay;
        current.tzid = tzid;
      }
    } else if (name === 'DTEND') {
      const date = parseIcsDate(value, tzid);
      if (date) current.end = date.ms;
    } else if (name === 'DURATION') {
      const match = value.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
      if (match && current.start !== undefined) {
        const [, d, h, mi, s] = match;
        current.end =
          current.start +
          (Number(d ?? 0) * DAY_MS +
            Number(h ?? 0) * 3_600_000 +
            Number(mi ?? 0) * 60_000 +
            Number(s ?? 0) * 1000);
      }
    } else if (name === 'RRULE') {
      current.rrule = value.trim();
    } else if (name === 'EXDATE') {
      for (const one of value.split(',')) {
        const date = parseIcsDate(one, tzid);
        if (date) current.exdates.push(date.ms);
      }
    }
  }

  return intervals;
}

/**
 * The grid slots a set of busy intervals takes out.
 *
 * A band counts as busy only when more than half of it is taken. A one-hour
 * call does not make a five-hour evening unusable, and blacking out the whole
 * band for it would train people to ignore the prefill — which is the one thing
 * a suggestion must not do. Everything here is a starting point the person
 * edits before it is saved, so this threshold shapes a suggestion rather than
 * deciding anyone's answer.
 */
export function busyGridSlots(
  intervals: BusyInterval[],
  slots: string[],
  slotRange: (slot: string) => { start: number; end: number },
): string[] {
  // Merged first, because summing raw overlaps double-counts: two meetings in
  // the same hour (an invitation and its duplicate, a call inside a blocked-out
  // afternoon) counted as two hours, which pushed bands over the threshold when
  // far less than half of them was really taken.
  const merged: BusyInterval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ start: interval.start, end: interval.end });
  }

  const busy: string[] = [];
  for (const slot of slots) {
    const { start, end } = slotRange(slot);
    const span = end - start;
    if (span <= 0) continue;
    let covered = 0;
    for (const interval of merged) {
      const overlap = Math.min(end, interval.end) - Math.max(start, interval.start);
      if (overlap > 0) covered += overlap;
    }
    if (covered / span > BUSY_SHARE) busy.push(slot);
  }
  return busy;
}
