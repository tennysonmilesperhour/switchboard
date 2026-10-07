import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Every bucket written by Switchboard uses `<uploader uid>/…` as its root. */
export const ACCOUNT_STORAGE_BUCKETS = [
  'avatars',
  'covers',
  'media',
  'media-private',
] as const;

const STORAGE_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 100;

function storageFailure(
  bucket: string,
  operation: 'list' | 'remove',
  error: unknown,
): Error {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : String(error);
  return new Error(`Could not ${operation} account objects in ${bucket}: ${message}`);
}

/**
 * Recursively enumerate the files beneath one user's bucket prefix. Upload
 * routes currently write one level deep, but walking virtual folders prevents
 * an older or direct-client nested object from surviving account deletion.
 */
export async function listUserStoragePaths(
  admin: SupabaseClient,
  bucket: string,
  userId: string,
): Promise<string[]> {
  const pendingFolders = [userId];
  const paths: string[] = [];

  while (pendingFolders.length > 0) {
    const folder = pendingFolders.pop();
    if (!folder) continue;

    for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw storageFailure(bucket, 'list', error);

      for (const object of data ?? []) {
        const path = `${folder}/${object.name}`;
        if (object.id) paths.push(path);
        else pendingFolders.push(path);
      }

      if ((data?.length ?? 0) < STORAGE_PAGE_SIZE) break;
    }
  }

  return paths;
}

/**
 * Delete and then re-list every user-owned storage prefix. Returning only after
 * the verification pass is empty makes account deletion fail closed: the auth
 * user is not removed while an avatar, cover, room photo, or voice note remains.
 */
export async function deleteUserStorage(
  admin: SupabaseClient,
  userId: string,
): Promise<Record<(typeof ACCOUNT_STORAGE_BUCKETS)[number], number>> {
  const deleted = {
    avatars: 0,
    covers: 0,
    media: 0,
    'media-private': 0,
  };

  for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
    const paths = await listUserStoragePaths(admin, bucket, userId);
    for (let start = 0; start < paths.length; start += STORAGE_REMOVE_BATCH_SIZE) {
      const batch = paths.slice(start, start + STORAGE_REMOVE_BATCH_SIZE);
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) throw storageFailure(bucket, 'remove', error);
    }

    const remaining = await listUserStoragePaths(admin, bucket, userId);
    if (remaining.length > 0) {
      throw new Error(
        `Account storage verification failed in ${bucket}: ${remaining.length} object(s) remain`,
      );
    }
    deleted[bucket] = paths.length;
  }

  return deleted;
}

/** Storage first, auth identity second. Database rows then cascade from auth. */
export async function deleteAccountAndData(
  admin: SupabaseClient,
  userId: string,
): Promise<Record<(typeof ACCOUNT_STORAGE_BUCKETS)[number], number>> {
  const deleted = await deleteUserStorage(admin, userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error('Could not delete the auth user', { cause: error });
  return deleted;
}

const PROFILE_COLUMNS = [
  'id',
  'display_name',
  'handle',
  'avatar_url',
  'cover_url',
  'bio',
  'tagline',
  'pronouns',
  'location',
  'links',
  'socials',
  'contact_email',
  'contact_phone',
  'contact_public',
  'interests',
  'down_to',
  'quiet_hours_start',
  'quiet_hours_end',
  'timezone',
  'onboarded',
  'sabbatical',
  'sabbatical_message',
  'discoverable',
  'discovery_geography',
  'discovery_demographics',
  'discovery_interests',
  'discovery_involvements',
  'discovery_mutuals',
  'discovery_contexts',
  'notify_plans',
  'notify_suggestions',
  'notify_reminders',
  'notify_messages',
  'notify_social',
  'legal_terms_version',
  'legal_terms_accepted_at',
  'community_covenant_accepted_at',
  'appearance_theme',
  'appearance_custom',
  'digest_enabled',
  'digest_hour',
  'created_at',
] as const;

const PLAN_COLUMNS = [
  'id',
  'title',
  'description',
  'location_name',
  'location_address',
  'latitude',
  'longitude',
  'starts_at',
  'ends_at',
  'time_zone',
  'capacity',
  'invite_mode',
  'status',
  'show_invite_list',
  'show_accepted',
  'show_expired',
  'room_id',
  'open_table',
  'broadcast_nearby',
  'cover_url',
  'theme',
  'wishlist_url',
  'reminders_enabled',
  'recurrence',
  'recurrence_interval_days',
  'cancel_reason',
  'cancel_voice_url',
  'happened_at',
  'parental_approval',
  'created_at',
] as const;

const RSVP_COLUMNS = [
  'id',
  'event_id',
  'position',
  'group_stage',
  'window_minutes',
  'status',
  'sent_at',
  'responded_at',
  'decline_note',
  'decline_message',
  'created_at',
] as const;

const RSVP_PLAN_COLUMNS = [
  'id',
  'title',
  'starts_at',
  'ends_at',
  'time_zone',
  'location_name',
  'location_address',
  'status',
] as const;

function columns(values: readonly string[]): string {
  return values.join(', ');
}

function queryFailure(area: string, error: unknown): Error {
  return new Error(`Account export query failed: ${area}`, { cause: error });
}

export interface MyDataExport {
  schemaVersion: 1;
  exportedAt: string;
  accountId: string;
  profile: Record<string, unknown>;
  plans: unknown[];
  rsvps: unknown[];
  messages: {
    rooms: unknown[];
    plans: unknown[];
  };
  signals: unknown[];
}

interface RsvpExportRow extends Record<string, unknown> {
  id: string;
  event_id: string;
  status: string;
}

interface RsvpPlanExportRow extends Record<string, unknown> {
  id: string;
}

interface RsvpAnswerExportRow extends Record<string, unknown> {
  invite_id: string;
}

export interface ExportClients {
  /**
   * Service role, used only for rows keyed directly on the caller's id: their
   * profile (whose contact columns are withheld from the API by column grant,
   * but are the owner's own data), their hosted plans, and the text they
   * themselves authored. Every query on it filters on `user.id`.
   */
  admin: SupabaseClient;
  /**
   * The caller's own RLS session, used wherever the answer to "may they see
   * this?" is someone else's decision — an invitation is visible only once the
   * host's cascade has sent it, and a plan's summary only while `can_view_event`
   * says so. Reading those through RLS means the export can never contain a
   * plan the app itself would refuse to show.
   */
  reader: SupabaseClient;
}

/**
 * Read only the caller's records with explicit column allowlists. Capability
 * secrets (`calendar_token`, event `share_token`, invite `guest_token`) are
 * intentionally absent from the downloadable file.
 */
export async function buildMyDataExport(
  { admin, reader }: ExportClients,
  user: User,
  exportedAt = new Date().toISOString(),
): Promise<MyDataExport> {
  const [profileResult, plansResult, rsvpsResult, roomMessagesResult, planMessagesResult, signalsResult] =
    await Promise.all([
      admin.from('profiles').select(columns(PROFILE_COLUMNS)).eq('id', user.id).single(),
      admin
        .from('events')
        .select(columns(PLAN_COLUMNS))
        .eq('host_id', user.id)
        .order('created_at', { ascending: true }),
      // `invites_select` shows an invitee their own row only once it has been
      // sent; a queued invitation is the host's unsent plan, not the caller's
      // RSVP, and must not surface here before it surfaces in the app.
      reader
        .from('invites')
        .select(columns(RSVP_COLUMNS))
        .eq('invitee_id', user.id)
        .order('created_at', { ascending: true }),
      admin
        .from('messages')
        .select('id, room_id, body, image_url, created_at')
        .eq('sender_id', user.id)
        .order('created_at', { ascending: true }),
      admin
        .from('event_comments')
        .select('id, event_id, body, voice_url, voice_duration_seconds, created_at')
        .eq('author_id', user.id)
        .order('created_at', { ascending: true }),
      admin
        .from('availability_signals')
        .select('id, emoji, label, circle_ids, expires_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
    ]);

  const firstFailure = [
    ['profile', profileResult.error],
    ['plans', plansResult.error],
    ['rsvps', rsvpsResult.error],
    ['room messages', roomMessagesResult.error],
    ['plan messages', planMessagesResult.error],
    ['signals', signalsResult.error],
  ].find(([, error]) => Boolean(error));
  if (firstFailure) throw queryFailure(String(firstFailure[0]), firstFailure[1]);

  const profileRow = profileResult.data as unknown as Record<string, unknown>;
  const rsvpRows = (rsvpsResult.data ?? []) as unknown as RsvpExportRow[];
  const visibleEventIds = [
    ...new Set(
      rsvpRows
        .filter((rsvp) => rsvp.status !== 'queued')
        .map((rsvp) => rsvp.event_id),
    ),
  ];
  const inviteIds = rsvpRows.map((rsvp) => rsvp.id);

  const [rsvpPlansResult, answersResult] = await Promise.all([
    // Through RLS: `events_select` is `can_view_event`, so a plan the caller
    // may no longer open is summarised as `null`, not exported.
    visibleEventIds.length > 0
      ? reader
          .from('events')
          .select(columns(RSVP_PLAN_COLUMNS))
          .in('id', visibleEventIds)
      : Promise.resolve({ data: [], error: null }),
    inviteIds.length > 0
      ? admin
          .from('invite_answers')
          .select('id, invite_id, question_id, answer, created_at')
          .in('invite_id', inviteIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rsvpPlansResult.error) {
    throw queryFailure('RSVP plan summaries', rsvpPlansResult.error);
  }
  if (answersResult.error) throw queryFailure('RSVP answers', answersResult.error);

  const rsvpPlanRows = (rsvpPlansResult.data ?? []) as unknown as RsvpPlanExportRow[];
  const answerRows = (answersResult.data ?? []) as unknown as RsvpAnswerExportRow[];
  const rsvpPlans = new Map(
    rsvpPlanRows.map((plan) => [plan.id, plan]),
  );
  const answersByInvite = new Map<string, unknown[]>();
  for (const answer of answerRows) {
    const current = answersByInvite.get(answer.invite_id) ?? [];
    current.push(answer);
    answersByInvite.set(answer.invite_id, current);
  }

  return {
    schemaVersion: 1,
    exportedAt,
    accountId: user.id,
    profile: {
      loginEmail: user.email ?? null,
      loginPhone: user.phone ?? null,
      authCreatedAt: user.created_at,
      lastSignedInAt: user.last_sign_in_at ?? null,
      ...profileRow,
    },
    plans: plansResult.data ?? [],
    rsvps: rsvpRows.map((rsvp) => ({
      ...rsvp,
      plan: rsvpPlans.get(rsvp.event_id) ?? null,
      answers: answersByInvite.get(rsvp.id) ?? [],
    })),
    messages: {
      rooms: roomMessagesResult.data ?? [],
      plans: planMessagesResult.data ?? [],
    },
    signals: signalsResult.data ?? [],
  };
}

export function serializeMyDataExport(data: MyDataExport): string {
  return JSON.stringify(data, null, 2);
}
