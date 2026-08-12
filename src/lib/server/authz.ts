import { createAdminClient } from '@/lib/supabase/admin';
import { reportOperationalError } from '@/lib/server/observability';

/**
 * The outcome of asking whether someone may manage a plan.
 *
 * Three states, not two: they may, they may not, or **we could not find out**.
 * That third one used to be folded into "they may not", which meant a failed
 * check — a dropped connection, an unconfigured service key, a renamed or
 * re-granted function — reached the host as *"Only the host can invite people
 * to this plan."* The app accused the host of not being the host, wrote nothing
 * to the log, and left the only evidence a screenshot that diagnosed nothing.
 * That is exactly the failure `src/lib/errors.ts` exists to prevent.
 */
export type ManagerCheck =
  | { ok: true; isManager: boolean }
  | { ok: false; isManager: false };

/**
 * Whether `userId` may manage `eventId` — the primary host OR a co-host — and
 * whether the question could be answered at all.
 *
 * Uses the service-role client but passes the caller's id explicitly (never
 * `auth.uid()`, which is null under the service role) — see docs/SECURITY.md.
 */
export async function checkEventManager(
  userId: string,
  eventId: string,
): Promise<ManagerCheck> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('is_event_host', {
      p_event: eventId,
      p_user: userId,
    });
    if (error) {
      await reportOperationalError('authz.event-manager', error, { eventId });
      return { ok: false, isManager: false };
    }
    return { ok: true, isManager: Boolean(data) };
  } catch (error) {
    // createAdminClient throws when the service key is absent. Fail closed,
    // but say so — this is a misconfigured server, not a permission decision.
    await reportOperationalError('authz.event-manager', error, { eventId });
    return { ok: false, isManager: false };
  }
}

/**
 * Fail-closed boolean form, for the many call sites where "not allowed" and
 * "couldn't tell" lead to the same refusal. Still logs when the check itself
 * failed, so the cause is recoverable from the logs rather than invisible.
 *
 * Prefer `checkEventManager` on any path whose refusal is shown to a person:
 * telling a host they are not the host is worse than telling them the server
 * had a problem.
 */
export async function isEventManager(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const result = await checkEventManager(userId, eventId);
  return result.ok && result.isManager;
}
