'use server';
import { requireUser } from '@/lib/server/require-user';
import { revalidatePath } from 'next/cache';
import { validation, type ActionResult } from '@/lib/errors';
import { reportAndFail } from '@/lib/server/observability';

const ROUTES = ['existing', 'sms', 'push', 'email', 'in_app'];

/**
 * The database refuses these for the reader's own state, not for a fault:
 * the sentence says what to do, so they carry no code.
 */
function refusal(error: { message?: string } | null): ReturnType<typeof validation> | null {
  const message = error?.message ?? '';
  if (message.includes('Enable SMS first')) {
    return validation(
      'Texts can’t deliver right now — subscribe above with a verified phone (and text START if you sent STOP) before choosing SMS.',
    );
  }
  if (message.includes('Verify your email first')) {
    return validation('Verify your email above before choosing email.');
  }
  if (message.includes('Verify your current phone number first')) {
    return validation('Verify your current phone number above before subscribing to texts.');
  }
  return null;
}

export interface NotificationChannelsInput {
  /** The text-message subscription, or null to leave it as it is. */
  sms: { enabled: boolean; plans: boolean; reminders: boolean } | null;
  /** The per-category channel choice, or null to leave it as it is. */
  routes: { plans: string; reminders: string; urgent: boolean } | null;
}

/**
 * Save the SMS subscription and the channel choice as one step.
 *
 * They depend on each other — SMS can only be chosen as a channel once the
 * subscription is on — so they are applied in that order in one action, rather
 * than as two independent saves whose order depended on which one the reader
 * happened to touch first.
 */
export async function updateNotificationChannels(
  input: NotificationChannelsInput,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { sms, routes } = input ?? { sms: null, routes: null };

  if (
    sms &&
    [sms.enabled, sms.plans, sms.reminders].some((value) => typeof value !== 'boolean')
  ) {
    return validation('Choose your SMS preferences.');
  }
  if (
    routes &&
    (!ROUTES.includes(routes.plans) ||
      !ROUTES.includes(routes.reminders) ||
      typeof routes.urgent !== 'boolean')
  ) {
    return validation('Choose a notification channel.');
  }

  if (sms) {
    const { error } = await supabase.rpc('set_sms_preferences', {
      p_enabled: sms.enabled,
      p_plans: sms.plans,
      p_reminders: sms.reminders,
    });
    if (error) {
      return refusal(error) ??
        reportAndFail('SB-SMS-PREFERENCES', 'sms.preferences', error, {
          userId: user.id,
          stage: 'subscription',
        });
    }
  }

  if (routes) {
    const { error } = await supabase.rpc('set_notification_routes', {
      p_plans: routes.plans,
      p_reminders: routes.reminders,
      p_urgent: routes.urgent,
    });
    if (error) {
      revalidatePath('/settings');
      return refusal(error) ??
        reportAndFail('SB-SMS-PREFERENCES', 'sms.preferences', error, {
          userId: user.id,
          stage: 'routes',
        });
    }
  }

  revalidatePath('/settings');
  return { ok: true };
}

/** Acknowledge the "your SMS-only alerts were switched back" note. */
export async function dismissSmsRouteNote(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase.rpc('dismiss_sms_route_note');
  if (error) {
    return reportAndFail('SB-SETTINGS-SAVE', 'settings.sms-note', error, {
      userId: auth.user.id,
    });
  }
  revalidatePath('/settings');
  return { ok: true };
}
