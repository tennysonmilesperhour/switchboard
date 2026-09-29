'use server';

import { failure, validation, type ErrorCode } from '@/lib/errors';
import {
  ContactMatchRateLimitError,
  CONTACT_MATCH_LIMIT_MESSAGE,
  isContactMatchRateLimit,
} from '@/lib/actions/event-action-shared';

import { revalidatePath } from 'next/cache';
import type { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { notifyUsers } from '@/lib/server/notify';
import { normalizePhoneNumber } from '@/lib/phone';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportAndFail } from '@/lib/server/observability';
import { circleEmoji } from '@/lib/circle-emoji';

/** PostgREST `.or()` filters are built by string interpolation below; only ever
 *  feed them DB-issued UUIDs. Assert that before interpolating (SB-29). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUuid(value: string): string {
  if (!UUID_RE.test(value)) throw new Error('Expected a UUID');
  return value;
}

export interface ConnectionResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  /** True when a request turned out to answer theirs, so you're now connected. */
  connected?: boolean;
}

export interface ContactCandidate {
  name: string;
  emails: string[];
  phones: string[];
}

/**
 * What a contact import found. `throttled` is set when the lookup budget ran out
 * before every contact was checked: the unmatched rows are then *unknown*, not
 * absent, and the caller must say so rather than "No contacts matched" (G7).
 * `error`/`code` carry the sentence and its code for that case.
 */
export interface ContactMatchResult {
  matches: ContactMatch[];
  throttled: boolean;
  error?: string;
  code?: ErrorCode;
}

/** How long "Ignore" hides someone's connection requests (D22). */
const IGNORE_DAYS = 90;

export interface ContactMatch {
  key: string;
  name: string;
  identifier: string;
  kind: 'handle' | 'email' | 'account_email' | 'phone';
  profile: {
    id: string;
    name: string;
    handle: string;
  } | null;
  connectionStatus: 'none' | 'incoming' | 'outgoing' | 'accepted' | 'self';
  smsTarget: string | null;
}

async function resolveProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  identifier: string,
) {
  const { data, error } = await supabase
    .rpc('resolve_profile_contact', { p_identifier: identifier })
    .maybeSingle();
  if (error && isContactMatchRateLimit(error)) throw new ContactMatchRateLimitError();
  return data ?? null;
}

function contactMatchKind(value: string | undefined): ContactMatch['kind'] {
  switch (value) {
    case 'handle':
    case 'email':
    case 'account_email':
    case 'phone':
      return value;
    default:
      return 'phone';
  }
}

/** A PostgREST filter matching the connection between two people, whichever
 *  of them asked. `connections` is unique per direction, not per pair. */
function pairFilter(a: string, b: string): string {
  assertUuid(a);
  assertUuid(b);
  return `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`;
}

async function connectionStatusFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  targetId: string,
): Promise<ContactMatch['connectionStatus']> {
  if (targetId === userId) return 'self';
  const { data } = await supabase
    .from('connections')
    .select('requester_id, addressee_id, status')
    .or(pairFilter(userId, targetId));
  const rows = data ?? [];
  if (rows.length === 0) return 'none';
  if (rows.some((row) => row.status === 'accepted')) return 'accepted';
  return rows.some((row) => row.requester_id === targetId) ? 'incoming' : 'outgoing';
}

/**
 * Insert a request from `userId` to `targetId`, unless the pair already has a
 * connection. The unique constraint is per direction, so without this check
 * asking someone who had already asked you created a second pending row: each
 * side then saw a request waiting on the other and nobody was connected. An
 * incoming request is accepted instead, which is what asking back means.
 */
async function requestOrAccept(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  targetId: string,
): Promise<ConnectionResult> {
  // Asking someone you ignored means you changed your mind. Clear it first:
  // while it stands, their pending request is hidden from you by RLS, and this
  // would otherwise create a second, opposite request instead of accepting it.
  await supabase
    .from('connection_request_ignores')
    .delete()
    .eq('ignorer_id', userId)
    .eq('ignored_id', targetId);

  const { data: existing } = await supabase
    .from('connections')
    .select('id, requester_id, status')
    .or(pairFilter(userId, targetId));
  const rows = existing ?? [];
  if (rows.some((row) => row.status === 'accepted')) {
    return validation('You’re already connected.');
  }
  const incoming = rows.find((row) => row.requester_id === targetId);
  if (incoming) {
    const accepted = await acceptConnection(incoming.id);
    return accepted.ok ? { ok: true, connected: true } : accepted;
  }
  if (rows.length > 0) return validation('Request already sent');

  const { error } = await supabase.from('connections').insert({
    requester_id: userId,
    addressee_id: targetId,
  });
  if (error) {
    if (error.code === '23505') return validation('Request already sent');
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.request', error, { targetId });
  }

  await notifyConnectionRequested(supabase, userId, targetId);
  revalidatePath('/people');
  return { ok: true };
}

/**
 * Record a durable "wants to connect" notification for the addressee (and push
 * it, honoring their `social` preference). A connection request is exactly the
 * kind of thing the SB-05 notifications table exists for — something the
 * recipient must be able to find later in /notifications and act on — so it
 * goes through notifyUsers, not a push that silently vanishes when they never
 * enabled notifications, are in quiet hours, or muted the category. This mirrors
 * how an event invite writes a durable `event_invite` row alongside its pending
 * surface; the accepted counterpart already uses `connection_accepted`.
 */
async function notifyConnectionRequested(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requesterId: string,
  addresseeId: string,
): Promise<void> {
  // Someone who pressed Ignore on this person in the last 90 days is not told
  // again (D22). The request itself still stands — the sender sees it pending,
  // which is true, and learns nothing either way.
  if (await requestIsIgnored(addresseeId, requesterId)) return;
  // The addressee is entitled to see who requested them (the pending row is
  // already visible to them on /people), so naming the requester here leaks
  // nothing and makes the bell self-explanatory.
  const { data: requester } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', requesterId)
    .maybeSingle();
  await notifyUsers([addresseeId], {
    kind: 'connection_request',
    title: 'New connection request 👋',
    body: `${requester?.display_name ?? 'Someone'} wants to connect on Switchboard.`,
    url: '/people',
  });
}

/**
 * Whether `addresseeId` ignored `requesterId`'s requests within the last 90
 * days. Ignore rows are private to the person who ignored (RLS), and the caller
 * here is the *requester*, so this reads with the service role — re-authorized
 * by the fact that its only effect is to withhold a notification, and nothing
 * about the answer reaches the caller.
 */
async function requestIsIgnored(addresseeId: string, requesterId: string): Promise<boolean> {
  if (!hasAdminCredentials()) return false;
  const since = new Date(Date.now() - IGNORE_DAYS * 86_400_000).toISOString();
  const { data } = await createAdminClient()
    .from('connection_request_ignores')
    .select('ignorer_id')
    .eq('ignorer_id', addresseeId)
    .eq('ignored_id', requesterId)
    .gt('ignored_at', since)
    .maybeSingle();
  return Boolean(data);
}

export async function sendConnectionRequest(identifier: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await checkRateLimit(`connect-request:${user.id}`, 30, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’re sending a lot of requests. Try again later.');
  }

  const cleaned = identifier.trim();
  if (!cleaned) return validation('Enter a handle, email, or phone number.');
  let target: Awaited<ReturnType<typeof resolveProfile>>;
  try {
    target = await resolveProfile(supabase, cleaned);
  } catch (error) {
    if (!isContactMatchRateLimit(error)) throw error;
    return failure('SB-RATE-LIMIT', CONTACT_MATCH_LIMIT_MESSAGE);
  }
  if (!target) {
    // Not "no such person". A handle always matches; an email or phone only
    // matches once its owner has verified it (resolve_profile_contact), which
    // most accounts never get around to. "No account matched" full stop reads
    // as "your friend isn't on Switchboard" — and the invite card directly
    // below then confirms it — when they may be one search away under their
    // handle. Name both routes out, in the order the reader can act on them.
    return validation(
        'No account matched. An email or phone only finds someone who verified it — ask for their @handle, or send them the app just below.',
    );
  }
  if (target.id === user.id) return validation('That is you.');

  return requestOrAccept(supabase, user.id, target.id);
}

/**
 * Send a connection request to a known profile id. Used where the target is
 * already resolved (e.g. an event host) so we don't need to round-trip a
 * handle — and it works even for accounts without a handle set.
 */
export async function sendConnectionRequestToId(
  targetId: string,
): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!UUID_RE.test(targetId)) return validation('Unknown person.');
  if (targetId === user.id) return validation('That is you.');

  if (!(await checkRateLimit(`connect-request:${user.id}`, 30, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’re sending a lot of requests. Try again later.');
  }

  // Confirm the target actually exists before inserting; a bad id would
  // otherwise surface only as an opaque FK error.
  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', targetId)
    .maybeSingle();
  if (!target) return validation('That account no longer exists.');

  return requestOrAccept(supabase, user.id, targetId);
}

/**
 * Re-nudge a still-pending outgoing request: fire the "wants to connect"
 * notification again without inserting a second row (the unique constraint
 * would reject it anyway). Only the requester can do this, only while it's
 * pending, and a per-request cooldown keeps a nudge from being turned into a
 * way to spam someone's bell (blocking already deletes the row, so a blocked
 * user has nothing left to resend).
 */
export async function resendConnectionRequest(
  connectionId: string,
): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!UUID_RE.test(connectionId)) return validation('Unknown request.');

  // RLS lets the requester read their own row; the explicit ownership/status
  // checks turn "not yours / already accepted / gone" into a clear message
  // rather than a silent re-notify.
  const { data: connection } = await supabase
    .from('connections')
    .select('requester_id, addressee_id, status')
    .eq('id', connectionId)
    .maybeSingle();
  if (!connection || connection.requester_id !== user.id) {
    return validation('That request is no longer available.');
  }
  if (connection.status !== 'pending') {
    return validation('You’re already connected.');
  }

  // Per-request cooldown (keyed by the connection, i.e. the specific addressee)
  // so a resend can't be used to hammer one person's notifications.
  if (!(await checkRateLimit(`resend-request:${connectionId}`, 3, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You nudged them recently. Give it a little while.');
  }

  await notifyConnectionRequested(supabase, user.id, connection.addressee_id);
  revalidatePath('/people');
  return { ok: true };
}

export async function resolveContactMatches(
  contacts: ContactCandidate[],
): Promise<ContactMatchResult> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { matches: [], throttled: false, error: auth.error, code: auth.code };
  }
  const { supabase, user } = auth;

  // resolveProfile is an account-existence oracle; throttle bulk lookups so a
  // contact list can't be used to enumerate who's on Switchboard (SB-12).
  // Exhausted, it used to return an empty list, which every caller rendered as
  // "No contacts matched" — telling a host their friends weren't here (G7).
  if (!(await checkRateLimit(`contact-match:${user.id}`, 10, 60 * 60))) {
    return {
      matches: [],
      throttled: true,
      error: CONTACT_MATCH_LIMIT_MESSAGE,
      code: 'SB-RATE-LIMIT',
    };
  }

  const cleanedContacts = contacts.slice(0, 100).map((contact, index) => ({
    key: `${index}-${contact.name || contact.emails[0] || contact.phones[0] || 'contact'}`,
    name: contact.name.trim() || contact.emails[0] || contact.phones[0] || 'Contact',
    emails: contact.emails.map((email) => email.trim()).filter(Boolean).slice(0, 5),
    phones: contact.phones.map((phone) => phone.trim()).filter(Boolean).slice(0, 5),
  }));

  const rows: ContactMatch[] = [];
  let throttled = false;
  for (const contact of cleanedContacts) {
    const identifiers = [...contact.emails, ...contact.phones];
    let resolved: Awaited<ReturnType<typeof resolveProfile>> = null;
    let matchedIdentifier = identifiers[0] ?? '';
    for (const identifier of identifiers) {
      if (throttled) break;
      try {
        resolved = await resolveProfile(supabase, identifier);
      } catch (error) {
        if (!isContactMatchRateLimit(error)) throw error;
        // The database bucket is spent: stop asking, and let the rest of the
        // list come back unmatched rather than fail the whole import.
        throttled = true;
        break;
      }
      if (resolved) {
        matchedIdentifier = identifier;
        break;
      }
    }

    const smsTarget =
      contact.phones.map(normalizePhoneNumber).find((phone): phone is string => Boolean(phone)) ??
      null;
    const connectionStatus = resolved
      ? await connectionStatusFor(supabase, user.id, resolved.id)
      : 'none';

    rows.push({
      key: contact.key,
      name: contact.name,
      identifier: matchedIdentifier || smsTarget || '',
      kind: contactMatchKind(resolved?.match_kind),
      profile: resolved
        ? {
            id: resolved.id,
            name: resolved.display_name,
            handle: resolved.handle,
          }
        : null,
      connectionStatus,
      smsTarget,
    });
  }

  if (!throttled) return { matches: rows, throttled: false };
  const found = rows.filter((row) => row.profile).length;
  return {
    matches: rows,
    throttled: true,
    error:
      found > 0
        ? `Found ${found} before hitting the lookup limit, so the rest weren’t checked. Wait a few minutes and import again, or add people by @handle.`
        : CONTACT_MATCH_LIMIT_MESSAGE,
    code: 'SB-RATE-LIMIT',
  };
}

export async function acceptConnection(connectionId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // RLS restricts this update to the addressee; the returned row is readable
  // because the accepter is a participant on it.
  const { data: updated, error } = await supabase
    .from('connections')
    .update({ status: 'accepted' })
    .eq('id', connectionId)
    .select('requester_id')
    .maybeSingle();
  if (error) {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.respond', error, { connectionId });
  }
  // RLS restricts this update to the addressee; a null row means nothing was
  // updated (not the addressee, or already gone) — report it instead of a
  // false success (SB-18).
  if (!updated) {
    return validation('That request is no longer available.');
  }

  if (updated?.requester_id) {
    const { data: me } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    await notifyUsers([updated.requester_id], {
      kind: 'connection_accepted',
      title: 'You’re connected 🎉',
      body: `${me?.display_name ?? 'Someone'} accepted your connection request.`,
      url: '/people',
    });
  }
  revalidatePath('/people');
  return { ok: true };
}

export async function removeConnection(connectionId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { error } = await supabase.from('connections').delete().eq('id', connectionId);
  if (error) {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.remove', error, { connectionId });
  }
  revalidatePath('/people');
  return { ok: true };
}

/**
 * "Ignore" on an incoming request (D22): hide this person's requests for 90
 * days. The request is not deleted — deleting it let the same person ask again
 * a minute later, with a fresh notification. It stays pending from their side
 * and is hidden from yours by RLS until the ignore expires or you ask them
 * yourself. They are never told.
 */
export async function ignoreConnectionRequest(connectionId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID_RE.test(connectionId)) return validation('That request is no longer available.');

  const { data: connection } = await supabase
    .from('connections')
    .select('requester_id, addressee_id, status')
    .eq('id', connectionId)
    .maybeSingle();
  if (!connection || connection.addressee_id !== user.id || connection.status !== 'pending') {
    return validation('That request is no longer available.');
  }

  const { error } = await supabase.from('connection_request_ignores').upsert(
    {
      ignorer_id: user.id,
      ignored_id: connection.requester_id,
      ignored_at: new Date().toISOString(),
    },
    { onConflict: 'ignorer_id,ignored_id' },
  );
  if (error) {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.ignore', error, { connectionId });
  }
  revalidatePath('/people');
  revalidatePath('/notifications');
  return { ok: true };
}

export async function blockProfile(profileId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID_RE.test(profileId)) return validation('Unknown person.');
  if (profileId === user.id) return validation('You cannot block yourself.');

  const { error } = await supabase.from('profile_blocks').insert({
    blocker_id: user.id,
    blocked_id: profileId,
  });
  if (error && error.code !== '23505') {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.block', error, { profileId });
  }
  // A block supersedes an ignore. Clear it first: while it stands, their
  // pending request is hidden from us by RLS, and a hidden row is also out of
  // reach of the delete below — it would outlive the block and resurface when
  // the ignore expired.
  await supabase
    .from('connection_request_ignores')
    .delete()
    .eq('ignorer_id', user.id)
    .eq('ignored_id', profileId);
  // A block ends the connection whichever surface it came from. This used to
  // happen only when the caller passed the connection id, which the People
  // page does and a room or a profile page does not, so blocking someone from
  // a room left them connected (and still inside every circle-scoped signal).
  const { error: unlinkError } = await supabase
    .from('connections')
    .delete()
    .or(pairFilter(user.id, profileId));
  if (unlinkError) {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.block', unlinkError, { profileId });
  }
  // They leave your circles too, so a later unblock doesn't silently restore
  // them to groups you curated. circle_members is owner-only under RLS.
  const { data: myCircles } = await supabase
    .from('circles')
    .select('id')
    .eq('owner_id', user.id);
  const circleIds = (myCircles ?? []).map((circle) => circle.id);
  if (circleIds.length > 0) {
    await supabase
      .from('circle_members')
      .delete()
      .in('circle_id', circleIds)
      .eq('member_id', profileId);
  }
  // Households are the same kind of curated group and were missed: a blocked
  // person stayed filed in yours, and was silently back in it (and in every
  // household invite) if you ever reconnected. household_members is owner-only.
  const { data: myHouseholds } = await supabase
    .from('households')
    .select('id')
    .eq('owner_id', user.id);
  const householdIds = (myHouseholds ?? []).map((household) => household.id);
  if (householdIds.length > 0) {
    await supabase
      .from('household_members')
      .delete()
      .in('household_id', householdIds)
      .eq('member_id', profileId);
  }
  revalidatePath('/people');
  return { ok: true };
}

/**
 * Undo a block. Nothing else comes back with it: the connection and circle
 * memberships the block removed stay removed, so either person has to ask again.
 */
export async function unblockProfile(profileId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID_RE.test(profileId)) return validation('Unknown person.');

  const { error } = await supabase
    .from('profile_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', profileId);
  if (error) {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.unblock', error, { profileId });
  }
  revalidatePath('/settings');
  revalidatePath('/people');
  return { ok: true };
}

/**
 * "Give space" — a private, one-directional avoidance. Unlike a block, you stay
 * connected; it only powers a quiet heads-up when this person is going to be
 * somewhere you are. Invisible to them (RLS scopes the row to the avoider), and
 * it never removes anyone from anything: warn, never remove.
 */
export async function giveSpace(profileId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID_RE.test(profileId)) return validation('Unknown person.');
  if (profileId === user.id) return validation('That is you.');

  const { error } = await supabase
    .from('profile_avoids')
    .insert({ avoider_id: user.id, avoided_id: profileId });
  // Already on the list is a no-op success, not an error.
  if (error && error.code !== '23505') {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.avoid', error, { profileId });
  }
  revalidatePath('/people');
  return { ok: true };
}

export async function stopGivingSpace(profileId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('profile_avoids')
    .delete()
    .eq('avoider_id', user.id)
    .eq('avoided_id', profileId);
  if (error) {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.unavoid', error, { profileId });
  }
  revalidatePath('/people');
  return { ok: true };
}

export async function reportProfile(
  profileId: string,
  reason: string,
): Promise<ConnectionResult> {
  const cleanReason = reason.trim().slice(0, 500);
  if (!cleanReason) return validation('Add a short reason.');
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Throttle so reports can't be used to flood moderation / mass-target a user.
  if (!(await checkRateLimit(`report:${user.id}`, 10, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’ve filed several reports. Try again later.');
  }

  const { error } = await supabase.from('user_reports').insert({
    reporter_id: user.id,
    reported_id: profileId,
    reason: cleanReason,
  });
  if (error) return reportAndFail('SB-CONNECTION-SAVE', 'connection.report', error, { profileId });
  return { ok: true };
}

export async function toggleCircleMember(
  circleId: string,
  memberId: string,
  add: boolean,
): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { error } = add
    ? await supabase.from('circle_members').insert({ circle_id: circleId, member_id: memberId })
    : await supabase
        .from('circle_members')
        .delete()
        .eq('circle_id', circleId)
        .eq('member_id', memberId);
  if (error && error.code !== '23505') {
    return reportAndFail('SB-CIRCLE-SAVE', 'circle.members', error, { circleId, memberId });
  }
  revalidatePath('/people');
  return { ok: true };
}

export async function createCircle(name: string, emoji: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const trimmed = name.trim();
  if (!trimmed) return validation('Circle needs a name');
  const { error } = await supabase
    .from('circles')
    .insert({ owner_id: user.id, name: trimmed.slice(0, 40), emoji: circleEmoji(emoji) });
  if (error) return reportAndFail('SB-CIRCLE-SAVE', 'circle.create', error);
  revalidatePath('/people');
  return { ok: true };
}

export async function renameCircle(
  circleId: string,
  name: string,
  emoji?: string,
): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const trimmed = name.trim();
  if (!trimmed) return validation('Circle needs a name');
  const patch: { name: string; emoji?: string } = { name: trimmed.slice(0, 40) };
  if (emoji?.trim()) patch.emoji = circleEmoji(emoji);
  // RLS already scopes this to the owner; the owner_id filter is defense in
  // depth so a stray id can never touch someone else's circle (SB-20).
  const { error } = await supabase
    .from('circles')
    .update(patch)
    .eq('id', circleId)
    .eq('owner_id', user.id);
  if (error) return reportAndFail('SB-CIRCLE-SAVE', 'circle.rename', error, { circleId });
  revalidatePath('/people');
  return { ok: true };
}

export async function deleteCircle(circleId: string): Promise<ConnectionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  // circle_members rows cascade-delete with the circle (FK on delete cascade);
  // the connections themselves are untouched — only this grouping goes away.
  const { error } = await supabase
    .from('circles')
    .delete()
    .eq('id', circleId)
    .eq('owner_id', user.id);
  if (error) return reportAndFail('SB-CIRCLE-SAVE', 'circle.delete', error, { circleId });
  revalidatePath('/people');
  return { ok: true };
}
