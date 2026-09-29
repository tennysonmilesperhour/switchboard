/**
 * Account suspension, in one place.
 *
 * A suspension is the auth server's own ban (`auth.users.banned_until`), set
 * only by the moderator functions in
 * `20260930070000_moderator_actions.sql`. Sign-in already names it: GoTrue
 * refuses a correct password with `user_banned`, which becomes
 * `SB-AUTH-SUSPENDED` (docs/AUTH.md). This module is what the proxy and the
 * server-action guard use to recognise the same state on a session that was
 * issued before the suspension, and what the moderation screen uses to say
 * how long one lasts. Pure: the proxy imports it.
 */

/** GoTrue's error code for a grant refused because the account is banned. */
export const SUSPENDED_AUTH_CODE = 'user_banned';

/** The `/login?error=` value that shows `SB-AUTH-SUSPENDED`. */
export const SUSPENDED_LOGIN_ERROR = 'suspended';

/** Where a suspended person is sent: the page that can say what is true. */
export const SUSPENDED_LOGIN_PATH = `/login?error=${SUSPENDED_LOGIN_ERROR}`;

/**
 * True while the account is suspended. An expired ban is no ban, exactly as
 * GoTrue reads it, so a suspension that ran out lets the person back in
 * without anyone lifting it.
 */
export function isSuspendedUser(
  user: { banned_until?: string | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  const until = user?.banned_until;
  if (!until) return false;
  const time = Date.parse(until);
  return Number.isFinite(time) && time > now;
}

/** How long a moderator may suspend for. `null` lasts until it is lifted. */
export const SUSPENSION_CHOICES: ReadonlyArray<{ days: number | null; label: string }> = [
  { days: 7, label: 'For 7 days' },
  { days: 30, label: 'For 30 days' },
  { days: null, label: 'Until a moderator lifts it' },
];

export function isSuspensionDays(value: unknown): value is number | null {
  return value === null || SUSPENSION_CHOICES.some((choice) => choice.days === value);
}

/**
 * The auth server has no "forever", so an open-ended suspension is stored a
 * century out. Anything more than 50 years away reads as open-ended.
 */
const OPEN_ENDED_AFTER_MS = 50 * 365 * 24 * 60 * 60 * 1000;

export function isOpenEndedSuspension(until: string, now: number = Date.now()): boolean {
  const time = Date.parse(until);
  return Number.isFinite(time) && time - now > OPEN_ENDED_AFTER_MS;
}

/** "until a moderator lifts it", or "until Oct 7" style, for the moderator. */
export function suspensionLabel(
  until: string,
  now: number = Date.now(),
  timeZone?: string,
): string {
  if (isOpenEndedSuspension(until, now)) return 'until a moderator lifts it';
  const date = new Date(until);
  const sameYear = date.getUTCFullYear() === new Date(now).getUTCFullYear();
  return `until ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    ...(timeZone ? { timeZone } : {}),
  })}`;
}
