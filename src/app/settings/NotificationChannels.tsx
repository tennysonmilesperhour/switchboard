'use client';

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { useSettingsSave } from './SettingsSaveBar';
import { useToast } from '@/components/ui/Toast';
import {
  dismissSmsRouteNote,
  updateNotificationChannels,
} from '@/lib/actions/sms-preferences';
import type { SmsRouteFallbackReason } from '@/lib/server/settings-page';

type Route = 'existing' | 'push' | 'sms' | 'email' | 'in_app';
type Category = 'plans' | 'reminders';

interface SmsDraft {
  enabled: boolean;
  plans: boolean;
  reminders: boolean;
}

interface RouteDraft {
  plans: Route;
  reminders: Route;
  urgent: boolean;
}

interface Draft {
  sms: SmsDraft;
  routes: RouteDraft;
}

const ROUTE_VALUES: Route[] = ['existing', 'push', 'sms', 'email', 'in_app'];

function asRoute(value: string | null | undefined): Route {
  return ROUTE_VALUES.includes(value as Route) ? (value as Route) : 'existing';
}

function sameSms(a: SmsDraft, b: SmsDraft): boolean {
  return a.enabled === b.enabled && a.plans === b.plans && a.reminders === b.reminders;
}

function sameRoutes(a: RouteDraft, b: RouteDraft): boolean {
  return a.plans === b.plans && a.reminders === b.reminders && a.urgent === b.urgent;
}

/** Why an "SMS only" choice was put back, in the reader's terms. */
const FALLBACK_REASONS: Record<SmsRouteFallbackReason, { why: string; next: string }> = {
  sms_off: {
    why: 'text messages were turned off',
    next: 'Turn texts back on below if you want SMS again.',
  },
  category_off: {
    why: 'that kind of text was unticked',
    next: 'Tick it again below, then choose SMS.',
  },
  stopped: {
    why: 'your number texted STOP',
    next: 'Text START to the Switchboard number to allow texts again, then choose SMS here.',
  },
  phone_changed: {
    why: 'your phone number changed or isn’t verified any more',
    next: 'Verify your current number above to use texts again.',
  },
};

export interface NotificationChannelsProps {
  initialSms: SmsDraft | null;
  initialRoutes: { plans: string; reminders: string } | null;
  urgent: boolean;
  phoneVerified: boolean;
  /** This deployment's STOP list has the verified phone on it. */
  phoneOptedOut: boolean;
  emailVerified: boolean;
  /** False when this deployment has no mail provider (or VAPID keys, for push): choosing that channel alone would silence the others and deliver nothing. */
  emailAvailable: boolean;
  pushAvailable: boolean;
  /** Set when an "SMS only" route was switched back because texts stopped delivering. */
  fallback: { at: string; reason: SmsRouteFallbackReason } | null;
}

/**
 * Text messages and "how plan alerts reach you", as one section of the
 * Settings save bar.
 *
 * They used to be two cards with their own Save buttons, outside the bar, so an
 * edit to either was invisible to "Save changes", to Cancel and to the
 * leave-page warning. They are also one decision: SMS can only be a channel
 * once the subscription is on, and unticking a kind of text while it is the
 * only channel for it would leave that kind of alert with nowhere to go. So the
 * draft keeps the two consistent as it is edited, and one action applies them
 * in the order the database needs.
 */
export function NotificationChannels({
  initialSms,
  initialRoutes,
  urgent,
  phoneVerified,
  phoneOptedOut,
  emailVerified,
  emailAvailable,
  pushAvailable,
  fallback,
}: NotificationChannelsProps) {
  const { register, setDirty } = useSettingsSave();
  const id = useId();
  const toast = useToast();
  const initial: Draft = {
    sms: {
      enabled: initialSms?.enabled ?? false,
      plans: initialSms?.plans ?? true,
      reminders: initialSms?.reminders ?? true,
    },
    routes: {
      plans: asRoute(initialRoutes?.plans),
      reminders: asRoute(initialRoutes?.reminders),
      urgent,
    },
  };
  const [draft, setDraft] = useState<Draft>(initial);
  const [baseline, setBaseline] = useState<Draft>(initial);
  const [adjusted, setAdjusted] = useState<string | null>(null);
  const [note, setNote] = useState(fallback);
  const [dismissing, startDismiss] = useTransition();

  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);

  const smsDeliverable = (sms: SmsDraft) => phoneVerified && !phoneOptedOut && sms.enabled;
  const urgentAllowed = (next: Draft) =>
    smsDeliverable(next.sms) && ['sms', 'existing'].includes(next.routes.plans);

  useEffect(() => {
    return register(id, {
      save: async () => {
        const next = draftRef.current;
        const base = baselineRef.current;
        const result = await updateNotificationChannels({
          sms: sameSms(next.sms, base.sms) ? null : next.sms,
          routes: sameRoutes(next.routes, base.routes)
            ? null
            : { ...next.routes, urgent: next.routes.urgent && urgentAllowed(next) },
        });
        if (result.ok) {
          setBaseline(next);
          setAdjusted(null);
          // Choosing channels again is the answer the note was asking for.
          if (!sameRoutes(next.routes, base.routes)) setNote(null);
          setDirty(id, false);
        }
        return result;
      },
      cancel: () => {
        setDraft(baselineRef.current);
        setAdjusted(null);
        setDirty(id, false);
      },
    });
    // urgentAllowed only reads props that stay fixed for this render tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, register, setDirty]);

  const update = useCallback(
    (next: Draft, why: string | null = null) => {
      setDraft(next);
      setAdjusted(why);
      const base = baselineRef.current;
      setDirty(id, !sameSms(next.sms, base.sms) || !sameRoutes(next.routes, base.routes));
    },
    [id, setDirty],
  );

  /** Keep "SMS only" from pointing at texts that can no longer arrive. */
  function withSms(sms: SmsDraft) {
    const routes = { ...draft.routes };
    const lost: string[] = [];
    for (const category of ['plans', 'reminders'] as Category[]) {
      if (routes[category] === 'sms' && !(smsDeliverable(sms) && sms[category])) {
        routes[category] = 'existing';
        lost.push(category === 'plans' ? 'plan alerts' : 'reminders');
      }
    }
    update(
      { sms, routes },
      lost.length > 0
        ? `SMS can’t carry ${lost.join(' or ')} any more, so ${lost.length > 1 ? 'they' : 'that'} will use existing settings instead.`
        : null,
    );
  }

  function withRoute(category: Category, value: Route) {
    // Choosing SMS for a category also ticks that kind of text, exactly as the
    // server will; showing it here means the draft is what gets saved.
    const sms = value === 'sms' ? { ...draft.sms, [category]: true } : draft.sms;
    update({ sms, routes: { ...draft.routes, [category]: value } });
  }

  function dismiss() {
    startDismiss(async () => {
      try {
        const result = await dismissSmsRouteNote();
        if (!result.ok) {
          toast.error(result.error ?? 'Could not dismiss that.', result.code);
          return;
        }
        setNote(null);
      } catch {
        toast.error('Could not dismiss that. Try again.');
      }
    });
  }

  const canSms = smsDeliverable(draft.sms);
  const smsBlockedReason = !phoneVerified
    ? ' — verify your phone above first'
    : phoneOptedOut
      ? ' — your number texted STOP'
      : !draft.sms.enabled
        ? ' — subscribe to texts above first'
        : '';

  return (
    <div className="space-y-5">
      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="font-bold text-ink">Text messages</h3>
        <p className="text-sm text-ink-soft">
          Optional Switchboard invitations and important plan updates at your verified phone
          number. Verification alone does not subscribe you. Message frequency varies; message
          and data rates may apply. Reply STOP to unsubscribe or HELP for help. No marketing.
        </p>
        {!phoneVerified && (
          <p className="text-sm">Verify your current phone number above before subscribing.</p>
        )}
        {phoneVerified && phoneOptedOut && (
          <p className="text-sm text-rose-deep">
            Your number texted STOP, so Switchboard can’t text it. Text START to the Switchboard
            number to allow texts again.
          </p>
        )}
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.sms.enabled}
            disabled={!phoneVerified}
            onChange={(event) => withSms({ ...draft.sms, enabled: event.target.checked })}
          />
          I agree to receive these text messages.
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.sms.plans}
            disabled={!phoneVerified || !draft.sms.enabled}
            onChange={(event) => withSms({ ...draft.sms, plans: event.target.checked })}
          />
          Invitations and important plan changes
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.sms.reminders}
            disabled={!phoneVerified || !draft.sms.enabled}
            onChange={(event) => withSms({ ...draft.sms, reminders: event.target.checked })}
          />
          Event reminders
        </label>
        <p className="text-xs text-ink-soft">
          Your quiet hours apply. Without custom quiet hours, texts wait between 10pm and 8am in
          your time zone. Old reminders expire instead of arriving late. In-app notifications
          remain available.
        </p>
        <p className="text-xs">
          <a href="/sms-compliance" className="underline">SMS terms</a> ·{' '}
          <a href="/privacy" className="underline">Privacy</a>
        </p>
      </section>

      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="font-bold">How plan alerts reach you</h3>
        {note && (
          <div role="status" className="rounded-card bg-gold-soft p-3 text-sm text-ink">
            <p>
              Your “SMS only” alerts were switched back to <strong>Existing settings</strong> on{' '}
              {new Date(note.at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}{' '}
              because {FALLBACK_REASONS[note.reason].why}, so they keep reaching you instead of
              going silent.
            </p>
            <p className="mt-1 text-ink-soft">{FALLBACK_REASONS[note.reason].next}</p>
            <button
              type="button"
              onClick={dismiss}
              disabled={dismissing}
              className="mt-2 text-sm font-bold text-terracotta-deep underline underline-offset-2"
            >
              Got it
            </button>
          </div>
        )}
        <p className="text-sm text-ink-soft">
          Choose one external channel for each category to avoid duplicate alerts. Everything
          stays in your in-app inbox. SMS and push follow quiet hours; email doesn’t. Email and
          SMS are sent by a background job that runs about once a minute, so allow a few minutes
          for them to arrive. “Existing settings” keeps your current combination.
        </p>
        {(
          [
            ['plans', 'Invitations and plan updates'],
            ['reminders', 'Event reminders'],
          ] as const
        ).map(([category, label]) => (
          <label key={category} className="block text-sm font-medium">
            {label}
            <select
              className="mt-1 block w-full rounded-card border border-line bg-paper px-3 py-2"
              value={draft.routes[category]}
              onChange={(event) => withRoute(category, asRoute(event.target.value))}
            >
              <option value="existing">Existing settings</option>
              <option value="push" disabled={!pushAvailable}>
                Push only{!pushAvailable ? ' — not available on this server' : ''}
              </option>
              <option value="sms" disabled={!canSms && draft.routes[category] !== 'sms'}>
                SMS only{smsBlockedReason}
              </option>
              <option value="email" disabled={!emailVerified || !emailAvailable}>
                Email only
                {!emailAvailable
                  ? ' — not available on this server'
                  : !emailVerified
                    ? ' — verify email first'
                    : ''}
              </option>
              <option value="in_app">In-app inbox only</option>
            </select>
          </label>
        ))}
        {adjusted && (
          <p role="status" className="text-sm text-ink">
            {adjusted}
          </p>
        )}
        <p className="text-xs text-ink-soft">
          Push also requires permission on your device and the category enabled above. Selecting
          SMS enables that text category.
        </p>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.routes.urgent && urgentAllowed(draft)}
            disabled={!urgentAllowed(draft)}
            onChange={(event) =>
              update({ ...draft, routes: { ...draft.routes, urgent: event.target.checked } })
            }
          />
          Allow time or location changes for plans starting within two hours to reach me by SMS
          during quiet hours.
        </label>
        <p className="text-xs text-ink-soft">
          Off by default. Applies only to plans you accepted, and only while SMS plan alerts are
          enabled. Invitations, announcements and reminders still wait.
        </p>
      </section>
    </div>
  );
}
