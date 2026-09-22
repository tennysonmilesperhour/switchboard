'use server';

import { revalidatePath } from 'next/cache';
import type { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEventManager } from '@/lib/server/authz';
import {
  advanceEventCascade,
  deliverInviteNow,
  type InvitationDeliverySummary,
} from '@/lib/server/cascade-runner';
import { getRelationship } from '@/lib/server/relationship';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import type { ActionResult } from '@/lib/errors';
import { failure, validation } from '@/lib/errors';
import type { EventStatus, InviteMode } from '@/lib/types';
import type { TablesInsert } from '@/lib/supabase/database.types';
import { suggestWindow } from '@/lib/engine/windows';
import { parseInviteEntries, type ParsedInviteEntry } from '@/lib/invite-entry';
import { hostCanEditInvitees } from '@/lib/share-link';
import { canAddInvitees, MAX_INVITEES_PER_EVENT } from '@/lib/invite-limits';
import {
  HANDLE_PATTERN,
  deliveryWarning,
  resolveProfileByContact,
  isContactMatchRateLimit,
  CONTACT_MATCH_LIMIT_MESSAGE,
  type AddPeopleResult,
} from '@/lib/actions/event-action-shared';

/** One resolved thing to insert: either a member (profileId) or a guest. */
type ResolvedAddition =
  | { kind: 'member'; profileId: string; label: string; contact?: string }
  | { kind: 'guest'; name: string; contact: string | null; label: string };

/**
 * Resolve one parsed entry against real profiles. A handle / email / phone that
 * matches a profile becomes a member invite; anything else becomes a guest
 * invite (with a shareable link, and an email if we have one).
 */
async function resolveAddition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: ParsedInviteEntry,
): Promise<ResolvedAddition | null> {
  if (parsed.kind === 'handle') {
    const match = await resolveProfileByContact(supabase, parsed.value);
    if (!match) return null; // unknown handle — reported as skipped
    return { kind: 'member', profileId: match.id, label: parsed.display };
  }
  if (parsed.kind === 'email') {
    const match = await resolveProfileByContact(supabase, parsed.value);
    if (match) {
      return {
        kind: 'member',
        profileId: match.id,
        label: parsed.display,
        contact: parsed.value,
      };
    }
    return { kind: 'guest', name: parsed.value, contact: parsed.value, label: parsed.display };
  }
  if (parsed.kind === 'phone') {
    const match = await resolveProfileByContact(supabase, parsed.value);
    if (match) {
      return {
        kind: 'member',
        profileId: match.id,
        label: parsed.display,
        contact: parsed.value,
      };
    }
    return { kind: 'guest', name: parsed.display, contact: parsed.value, label: parsed.display };
  }
  // Plain name — an off-platform guest reachable via their guest link.
  return { kind: 'guest', name: parsed.value, contact: null, label: parsed.display };
}

/**
 * Resolve a username to a real account for the invite flow. Returns null when
 * no profile has that handle, so the UI can say the user doesn't exist rather
 * than silently creating an off-platform guest for a typo'd username.
 */
export async function lookupInviteeByHandle(
  handle: string,
): Promise<{ id: string; name: string; handle: string } | null> {
  const cleaned = handle.trim().toLowerCase().replace(/^@/, '');
  if (!HANDLE_PATTERN.test(cleaned)) return null;
  const auth = await requireUser();
  if (!auth.ok) return null;
  const { supabase } = auth;
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, handle')
    .eq('handle', cleaned)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    name: (data.display_name as string) ?? cleaned,
    handle: (data.handle as string) ?? cleaned,
  };
}

/**
 * Append people to an already-live cascade. Accepts free-typed entries
 * (handle / email / phone / name) and explicitly-picked connection ids. New
 * invitees join the back of the line as `queued` and go out when it's their
 * turn (individual mode) or as a fresh trailing wave (group / all-at-once).
 * Host/co-host only, while invitations are in motion. Best-effort delivery
 * (push to members, email to guests) runs on the cascade tick.
 */
export async function addPeopleToEvent(
  eventId: string,
  input: { entries?: string[]; profileIds?: string[] } = {},
): Promise<AddPeopleResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can add people.');
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, host_id, status, invite_mode, starts_at')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return validation('Plan not found.');

  // Match the response window to how soon the event is, like the wizard does,
  // instead of letting these rows fall back to the 24h table default (which
  // can outlive an imminent event and stall an individual-mode line).
  const windowMinutes = event.starts_at
    ? suggestWindow(new Date(event.starts_at), new Date()).windowMinutes
    : 1440;
  if (!hostCanEditInvitees(event.status)) {
    return validation('You can only add people while invitations are in motion.');
  }

  const skipped: Array<{ entry: string; reason: string }> = [];

  // Resolve free-typed entries into members/guests.
  const parsedEntries = parseInviteEntries(input.entries ?? []);
  let resolutions: Array<{ parsed: ParsedInviteEntry; resolved: ResolvedAddition | null }>;
  try {
    resolutions = await Promise.all(
      parsedEntries.map(async (parsed) => ({
        parsed,
        resolved: await resolveAddition(supabase, parsed),
      })),
    );
  } catch (error) {
    if (!isContactMatchRateLimit(error)) throw error;
    return failure('SB-RATE-LIMIT', CONTACT_MATCH_LIMIT_MESSAGE);
  }
  let additions: ResolvedAddition[] = [];
  for (const { parsed, resolved } of resolutions) {
    if (!resolved) {
      skipped.push({ entry: parsed.display, reason: 'no one with that handle' });
      continue;
    }
    additions.push(resolved);
  }

  // Explicitly-picked connections (by profile id) — validate they exist.
  const pickedIds = Array.from(new Set(input.profileIds ?? [])).filter(Boolean);
  if (pickedIds.length > 0) {
    const { data: picked } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', pickedIds);
    for (const profile of picked ?? []) {
      additions.push({
        kind: 'member',
        profileId: profile.id as string,
        label: (profile.display_name as string) ?? 'Friend',
      });
    }
  }

  // Contact resolution already omits blocked profiles, but explicitly-picked
  // ids and a block created during this request still need an action-time
  // check. The insert trigger repeats this under the event-row lock. The
  // two-id form of `are_blocked` is service-role only (a browser role may
  // only ask about itself via `is_blocked_with`), and the relationship that
  // matters is the *host's* — a co-host may be adding — so this runs through
  // the admin client that `checkEventManager` has already authorized.
  const memberIds = Array.from(new Set(
    additions
      .filter((addition): addition is Extract<ResolvedAddition, { kind: 'member' }> =>
        addition.kind === 'member')
      .map((addition) => addition.profileId),
  ));
  const blockChecks = await Promise.all(
    memberIds.map(async (profileId) => ({
      profileId,
      result: await admin.rpc('are_blocked', {
        p_user_a: event.host_id,
        p_user_b: profileId,
      }),
    })),
  );
  const failedBlockCheck = blockChecks.find(({ result }) => result.error);
  if (failedBlockCheck?.result.error) {
    return {
      ...(await reportAndFail(
        'SB-INVITE-SEND',
        'add-people',
        failedBlockCheck.result.error,
        { eventId },
        'Could not verify those invitees. Try again.',
      )),
      skipped,
    };
  }
  const blockedIds = new Set(
    blockChecks
      .filter(({ result }) => result.data === true)
      .map(({ profileId }) => profileId),
  );
  if (blockedIds.size > 0) {
    additions = additions.filter((addition) => {
      if (addition.kind !== 'member' || !blockedIds.has(addition.profileId)) {
        return true;
      }
      skipped.push({ entry: addition.label, reason: 'blocked relationship' });
      return false;
    });
  }

  if (additions.length === 0) {
    return { ...validation('Add at least one person.'), skipped };
  }

  // Existing invites: compute append positions/stage and skip anyone already on.
  const { data: existing } = await admin
    .from('invites')
    .select('invitee_id, guest_contact, position, group_stage')
    .eq('event_id', eventId);
  const rows = existing ?? [];
  const alreadyMembers = new Set(
    rows.map((r) => r.invitee_id).filter((id): id is string => Boolean(id)),
  );
  const alreadyContacts = new Set(
    rows
      .map((r) => r.guest_contact)
      .filter((c): c is string => Boolean(c))
      .map((c) => c.toLowerCase()),
  );
  let nextPosition = rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
  const nextStage = rows.reduce((max, r) => Math.max(max, r.group_stage), -1) + 1;
  // Staged group mode sends the additions as one fresh trailing wave. Individual
  // mode ignores stage and orders purely by position. "Everyone at once" has no
  // staging: additions must join the live wave (stage 0) so the cascade sends
  // them right away — parking them in a trailing stage would leave them queued
  // (and thus invisible: no invite, no in-app notification) until every original
  // invitee happened to respond, which in an all-at-once plan may never happen.
  const groupStage =
    event.invite_mode === 'group'
      ? nextStage
      : 0;

  const toInsert: TablesInsert<'invites'>[] = [];
  for (const addition of additions) {
    if (addition.kind === 'member') {
      if (addition.profileId === user.id) {
        skipped.push({ entry: addition.label, reason: 'that’s you' });
        continue;
      }
      if (alreadyMembers.has(addition.profileId)) {
        skipped.push({ entry: addition.label, reason: 'already invited' });
        continue;
      }
      alreadyMembers.add(addition.profileId);
      toInsert.push({
        event_id: eventId,
        invitee_id: addition.profileId,
        guest_contact: addition.contact ?? null,
        position: nextPosition++,
        group_stage: groupStage,
        window_minutes: windowMinutes,
        status: 'queued',
      });
    } else {
      const contactKey = addition.contact?.toLowerCase() ?? null;
      if (contactKey && alreadyContacts.has(contactKey)) {
        skipped.push({ entry: addition.label, reason: 'already invited' });
        continue;
      }
      if (contactKey) alreadyContacts.add(contactKey);
      toInsert.push({
        event_id: eventId,
        invitee_id: null,
        guest_name: addition.name,
        guest_contact: addition.contact,
        position: nextPosition++,
        group_stage: groupStage,
        window_minutes: windowMinutes,
        status: 'queued',
      });
    }
  }

  if (toInsert.length === 0) {
    return { ...validation('No new people to add.'), skipped };
  }
  if (!canAddInvitees(rows.length, toInsert.length)) {
    return {
      ...validation(
        `A plan can include up to ${MAX_INVITEES_PER_EVENT} people. Remove someone before adding more.`,
      ),
      skipped,
    };
  }

  const { error } = await admin.from('invites').insert(toInsert);
  if (error) {
    return {
      ...(await reportAndFail(
        'SB-INVITE-SEND',
        'add-people',
        error,
        { eventId },
        'Could not add people. Try again.',
      )),
      skipped,
    };
  }

  // Send immediately if the cascade is ready for them (e.g. individual mode
  // with no live invite, or a resolved prior wave). The cron sweep is the backstop.
  let delivery: InvitationDeliverySummary | undefined;
  try {
    delivery = await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('add-people-cascade', cascadeError, { eventId });
  }

  revalidatePath(`/events/${eventId}`);
  return {
    ok: true,
    added: toInsert.length,
    skipped,
    warning: deliveryWarning(delivery),
  };
}

/**
 * Invite one of your connections to a live plan, and send it to them now.
 *
 * `addPeopleToEvent` puts someone at the back of the cascade, where they wait
 * for their turn — right for filling out a plan, wrong for the moment a host is
 * looking at a specific person and wants to ask *them*. This sends immediately:
 * the invite is written `sent`, and it lands in their notifications (and push,
 * if they've allowed it) through the same delivery path the cascade uses, so a
 * hand-sent invitation is indistinguishable from a cascaded one once it
 * arrives.
 *
 * Jumping the line is safe because a live invite is not a claim on a seat:
 * capacity is enforced when someone *accepts* (`respond_to_invite`, under the
 * event row lock). It is refused on a full plan anyway, since the next cascade
 * tick would cancel it straight back and leave the host wondering why nothing
 * happened.
 *
 * Two gates, both server-side: the caller must manage this plan, and must
 * already be connected to the person (docs/SECURITY.md §§4-5). The connection
 * is read through the caller's own RLS client — `connections_select` is
 * participants-only, so a forged profile id resolves to "not connected" rather
 * than to somebody else's relationship.
 */
export async function inviteConnectionNow(
  eventId: string,
  profileId: string,
): Promise<ActionResult & { name?: string; warning?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  // Three outcomes, not two. A check that could not run is an operational
  // failure with its own code — not a verdict that this person isn't the host.
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can invite people to this plan.');
  }
  if (profileId === user.id) return validation('That’s you.');

  const relationship = await getRelationship(supabase, user.id, profileId);
  if (relationship.status !== 'accepted') {
    return failure(
      'SB-PERM-DENIED',
      'You can only send a direct invite to someone you’re connected to.',
    );
  }
  // A block that was placed without tearing down the connection row would
  // otherwise slip through the check above.
  const { data: blocked } = await supabase.rpc('is_blocked_with', {
    p_other: profileId,
  });
  if (blocked) return failure('SB-PERM-DENIED', 'You can’t invite this person.');

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, status, capacity, invite_mode, starts_at')
    .eq('id', eventId)
    .maybeSingle<{
      id: string;
      status: EventStatus;
      capacity: number | null;
      invite_mode: InviteMode;
      starts_at: string | null;
    }>();
  if (!event) return validation('Plan not found.');
  if (!hostCanEditInvitees(event.status)) {
    return validation('This plan isn’t sending invitations right now.');
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', profileId)
    .maybeSingle<{ display_name: string | null }>();
  const name = profile?.display_name?.trim() || 'They';

  const { data: existing } = await admin
    .from('invites')
    .select('invitee_id, position, group_stage, status')
    .eq('event_id', eventId);
  const rows = existing ?? [];
  if (rows.some((row) => row.invitee_id === profileId)) {
    return validation(`${name} is already on this plan.`);
  }
  if (!canAddInvitees(rows.length, 1)) {
    return validation(`A plan can include up to ${MAX_INVITEES_PER_EVENT} people.`);
  }

  // Same reasoning as resendInvite: don't send into a full plan.
  const accepted = rows.filter((row) => row.status === 'accepted').length;
  const cap =
    event.capacity ?? (event.invite_mode === 'individual' ? 1 : null);
  if (cap !== null && accepted >= cap) {
    return validation('This plan is already full.');
  }

  const position = rows.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  const groupStage =
    event.invite_mode === 'group'
      ? rows.reduce((max, row) => Math.max(max, row.group_stage), -1) + 1
      : 0;

  const { data: inserted, error } = await admin
    .from('invites')
    .insert({
      event_id: eventId,
      invitee_id: profileId,
      position,
      group_stage: groupStage,
      // Same window rule the wizard and the add-people panel use, so a
      // hand-sent invite expires on the plan's schedule rather than the
      // table's 24h default.
      window_minutes: event.starts_at
        ? suggestWindow(new Date(event.starts_at), new Date()).windowMinutes
        : 1440,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !inserted) {
    return reportAndFail(
      'SB-INVITE-SEND',
      'invite-connection-now',
      error,
      { eventId },
      'Could not send that invite. Try again.',
    );
  }

  let delivery: InvitationDeliverySummary | undefined;
  try {
    delivery = await deliverInviteNow(eventId, inserted.id);
  } catch (deliveryError) {
    await reportOperationalError('invite-connection-deliver', deliveryError, {
      eventId,
    });
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true, name, warning: deliveryWarning(delivery) };
}

/**
 * Withdraw a not-yet-accepted invite (queued, live, expired, declined, …).
 * Accepted attendees can't be silently dropped this way. Advances the cascade
 * so the next person goes out if a live slot just opened. Host/co-host only.
 */
export async function removeInvite(
  eventId: string,
  inviteId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can manage invites.');
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('invites')
    .select('id, status, event_id')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite || invite.event_id !== eventId) {
    return validation('Invite not found.');
  }
  if (invite.status === 'accepted') {
    return validation('They already accepted - cancel the plan or lower capacity instead.');
  }

  const { error } = await admin.from('invites').delete().eq('id', inviteId);
  if (error) {
    return reportAndFail('SB-INVITE-SEND', 'remove-invite', error, { eventId, inviteId });
  }

  try {
    await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('remove-invite-cascade', cascadeError, { eventId });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Give a lapsed invite another chance: re-queue someone who expired, declined,
 * or was cancelled so the cascade can send to them again. Host/co-host only.
 */
export async function resendInvite(
  eventId: string,
  inviteId: string,
): Promise<ActionResult & { warning?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can manage invites.');
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('invites')
    .select('id, status, event_id')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite || invite.event_id !== eventId) {
    return validation('Invite not found.');
  }
  const reopenable = ['expired', 'declined', 'cancelled'];
  if (!reopenable.includes(invite.status as string)) {
    return validation('That invite is still active.');
  }

  // Don't re-queue into a full event — the cascade would immediately cancel it
  // again, leaving the host no feedback that the resend was futile.
  const { data: capacityRow } = await admin
    .from('events')
    .select('capacity, invite_mode')
    .eq('id', eventId)
    .maybeSingle();
  const { count: acceptedCount } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'accepted');
  const cap =
    capacityRow?.capacity ??
    (capacityRow?.invite_mode === 'individual' ? 1 : null);
  if (cap !== null && (acceptedCount ?? 0) >= cap) {
    return validation('This plan is already full.');
  }

  const { error } = await admin
    .from('invites')
    .update({
      status: 'queued',
      sent_at: null,
      responded_at: null,
      decline_note: null,
    })
    .eq('id', inviteId);
  if (error) {
    return reportAndFail('SB-INVITE-SEND', 'resend-invite', error, { eventId, inviteId });
  }

  let delivery: InvitationDeliverySummary | undefined;
  try {
    delivery = await advanceEventCascade(eventId);
  } catch (cascadeError) {
    await reportOperationalError('resend-invite-cascade', cascadeError, { eventId });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true, warning: deliveryWarning(delivery) };
}

/** Reorder a queued invite up or down the line (host/co-host, individual mode). */
export async function moveQueuedInvite(
  eventId: string,
  inviteId: string,
  up: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can manage invites.');
  }
  // Authorization + queued-only + the atomic position swap all live in the
  // security-definer function.
  const { error } = await supabase.rpc('move_queued_invite', {
    p_invite: inviteId,
    p_up: up,
  });
  if (error) {
    return reportAndFail('SB-INVITE-SEND', 'invite.move', error, { eventId, inviteId });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Move a not-yet-sent invite into another wave (host/co-host).
 *
 * The wave plan's version of reordering. `move_queued_invite` swaps two people
 * in a one-at-a-time line; a wave plan asks a whole stage together, so the only
 * order it has is which stage somebody is in — and until now that was frozen
 * after the wizard. The bounds (an existing wave or the one after it, five at
 * most) and the queued-only guard live in the function, so a wave that has
 * already gone out cannot be rewritten.
 */
export async function setInviteStage(
  eventId: string,
  inviteId: string,
  stage: number,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can manage invites.');
  }
  const { error } = await supabase.rpc('set_invite_stage', {
    p_invite: inviteId,
    p_stage: stage,
  });
  if (error) {
    return reportAndFail('SB-INVITE-SEND', 'invite.stage', error, { eventId, inviteId });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Change the response window on a not-yet-sent invite (host/co-host). */
export async function setInviteWindow(
  eventId: string,
  inviteId: string,
  minutes: number,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can manage invites.');
  }
  const { error } = await supabase.rpc('set_invite_window', {
    p_invite: inviteId,
    p_minutes: minutes,
  });
  if (error) {
    return reportAndFail('SB-INVITE-SEND', 'invite.window', error, { eventId, inviteId });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
