import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { InvitationDeliverySummary } from '@/lib/server/cascade-runner';
import type { EventTheme, InviteMode, RecurrenceKind } from '@/lib/types';
import type { ErrorCode } from '@/lib/errors';
import type { NewQuestion } from '@/lib/plan-extras';
import { validation } from '@/lib/errors';
import { normalizePhoneNumber } from '@/lib/phone';
import { isValidCoordinate } from '@/lib/geo';
import { geocode } from '@/lib/server/geocode';
import { reportOperationalError } from '@/lib/server/observability';

export interface WizardInvitee {
  /** Profile id for members; null for guests. */
  profileId: string | null;
  guestName?: string;
  guestContact?: string;
  groupStage: number;
  windowMinutes: number;
}

export interface CreateEventInput {
  title: string;
  description: string | null;
  locationName: string | null;
  locationAddress: string | null;
  /** Coordinate for the location, when the host picked a map-recognized place.
   *  Null falls back to a best-effort server-side geocode of the free text. */
  latitude: number | null;
  longitude: number | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Host's IANA zone (browser-resolved), so server renders show the intended
   *  wall-clock time. See `events.time_zone`. */
  timeZone: string | null;
  capacity: number | null;
  inviteMode: InviteMode;
  openTable: boolean;
  /** Also show this Open Table to people nearby, strangers included. */
  broadcastNearby?: boolean;
  showInviteList: boolean;
  showAccepted: boolean;
  showExpired: boolean;
  enablePoll: boolean;
  pollResolution: 'host_pick' | 'auto' | 'runoff';
  suggestDeadline: string | null;
  voteDeadline: string | null;
  /** Whether the reminder sweep (day-before and starting-soon, see `dueReminders`) pings this plan. */
  remindersEnabled: boolean;
  /** Presentation */
  coverUrl?: string | null;
  theme?: EventTheme;
  wishlistUrl?: string | null;
  /** How often the plan repeats; day-count only when recurrence is 'custom'. */
  recurrence?: RecurrenceKind;
  recurrenceIntervalDays?: number | null;
  /** Host-defined RSVP questions, in order. A 'choice' question carries the
   *  selectable `options`; 'text' (the default) is free response. */
  questions?: Array<{
    prompt: string;
    required: boolean;
    kind?: 'text' | 'choice';
    options?: string[];
  }>;
  /** Require guardian/parental approval for every RSVP (youth events). */
  parentalApproval?: boolean;
  /** Standing ritual this plan fulfills, if any. */
  ritualId?: string | null;
  /** Already in host-preferred order. */
  invitees: WizardInvitee[];
}

export interface CreateEventResult {
  ok: boolean;
  eventId?: string;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  delivery?: InvitationDeliverySummary;
  warning?: string;
}

export function createEventError(error: string): CreateEventResult {
  return validation(error);
}

export function deliveryWarning(delivery: InvitationDeliverySummary | undefined): string | undefined {
  if (!delivery) return undefined;
  const count =
    delivery.notConfigured
    + delivery.failed
    + delivery.invalidRecipient
    + delivery.optedOut
    + delivery.manual;
  return count > 0
    ? `${count} invitation channel${count === 1 ? '' : 's'} needs attention.`
    : undefined;
}

export const HANDLE_PATTERN = /^@?[a-z0-9_]{3,24}$/;

export function maybeHandle(
  value: string | null | undefined,
  options: { requireAt?: boolean } = {},
): string | null {
  if (options.requireAt && !String(value ?? '').trim().startsWith('@')) return null;
  const normalized = String(value ?? '').trim().toLowerCase().replace(/^@/, '');
  return HANDLE_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Look up an existing account for one free-typed identifier (handle, email, or
 * phone). Delegates to the `resolve_profile_contact` RPC so an invite finds a
 * profile the same way friend search does — critically, it matches the
 * account's *sign-in* email (auth.users.email), not only the opt-in
 * `contact_email` column, which is null for anyone who never filled it in. Runs
 * as the signed-in host, so it also skips self and blocked accounts.
 */
export async function resolveProfileByContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  identifier: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .rpc('resolve_profile_contact', { p_identifier: identifier })
    .maybeSingle<{ id: string; display_name: string | null; handle: string | null }>();
  if (error && isContactMatchRateLimit(error)) throw new ContactMatchRateLimitError();
  if (!data?.id) return null;
  return { id: data.id, name: data.display_name ?? data.handle ?? 'Friend' };
}

/**
 * The database throttle on `resolve_profile_contact` raises once a person has
 * spent their hourly email/phone lookups, rather than returning "no match",
 * so a host is told to wait instead of watching friends become unlinked
 * guests. Callers that resolve several identifiers catch this once and turn it
 * into `SB-RATE-LIMIT`.
 */
export class ContactMatchRateLimitError extends Error {
  constructor() {
    super('contact-match rate limit');
    this.name = 'ContactMatchRateLimitError';
  }
}

export function isContactMatchRateLimit(error: unknown): boolean {
  if (error instanceof ContactMatchRateLimitError) return true;
  if (!error || typeof error !== 'object') return false;
  const { message, hint } = error as { message?: unknown; hint?: unknown };
  return (
    hint === 'SB-RATE-LIMIT' ||
    (typeof message === 'string' && message.includes('contact-match rate limit'))
  );
}

export const CONTACT_MATCH_LIMIT_MESSAGE =
  'You looked up a lot of contacts in a short time. Wait a few minutes, or add people by @handle.';

export async function resolveInvitees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invitees: WizardInvitee[],
): Promise<WizardInvitee[]> {
  return Promise.all(
    invitees.map(async (invitee) => {
      if (invitee.profileId) return invitee;
      const contact = invitee.guestContact?.trim() || null;
      // Resolve by whatever the host typed: a contact (handle / email / phone)
      // or an `@handle` still sitting in the name field.
      const identifier =
        contact ?? maybeHandle(invitee.guestName, { requireAt: true });
      if (!identifier) return invitee;

      const match = await resolveProfileByContact(supabase, identifier);
      if (!match) return invitee;

      const phone = normalizePhoneNumber(contact);
      return {
        ...invitee,
        profileId: match.id,
        guestContact: phone ?? contact ?? undefined,
      };
    }),
  );
}

/**
 * Give a freshly-created plan a map coordinate so it appears on /map right away.
 * Prefers the point the host picked from place search; otherwise best-effort
 * geocodes the free-text location. Runs on the host's own event through the user
 * client — the events UPDATE policy already lets a host set latitude/longitude
 * (this is exactly what the map's "Locate my plans" control does), so no
 * service-role write. Purely additive: any miss just leaves the plan un-located,
 * and "Locate my plans" can still fill it in later.
 */
export async function persistEventCoordinates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  input: CreateEventInput,
): Promise<void> {
  let point: { lat: number; lng: number } | null = null;
  if (isValidCoordinate(input.latitude, input.longitude)) {
    point = { lat: input.latitude as number, lng: input.longitude as number };
  } else if (input.locationName?.trim()) {
    const query = [input.locationName, input.locationAddress]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ');
    point = await geocode(query);
  }
  if (!point) return;

  const { error } = await supabase
    .from('events')
    .update({ latitude: point.lat, longitude: point.lng })
    .eq('id', eventId);
  if (error) await reportOperationalError('event-locate', error, { eventId });
}

export interface AddPeopleResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  /** How many new invitees were appended to the cascade. */
  added?: number;
  /** Entries that couldn't be added, each with a short reason. */
  skipped?: Array<{ entry: string; reason: string }>;
  warning?: string;
}
export interface UpdateEventInput {
  title: string;
  description: string | null;
  locationName: string | null;
  locationAddress: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Editor's IANA zone (browser-resolved); re-anchors `time_zone` whenever the
   *  start time is edited, mirroring how the form recomputes `startsAt`. */
  timeZone: string | null;
  capacity: number | null;
  wishlistUrl: string | null;
  /**
   * What else may change after creation (decision D18). Omitted means leave
   * all of it as it is. Parental approval and recurrence are deliberately not
   * here: they stay as the plan was made.
   */
  extras?: {
    coverUrl: string | null;
    theme: EventTheme;
    remindersEnabled: boolean;
    openTable: boolean;
    broadcastNearby?: boolean;
    /** Questions to add. Existing ones are never edited or removed here. */
    newQuestions: NewQuestion[];
  };
}
