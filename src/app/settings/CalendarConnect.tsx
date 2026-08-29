'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  connectCalendar,
  disconnectCalendar,
  syncCalendar,
  type CalendarStatus,
} from '@/lib/actions/calendar-sync';
import { formatRelative } from '@/lib/format';

/**
 * The other direction of "your calendar": reading yours in, rather than
 * publishing your plans out.
 *
 * The pair sit together on purpose — someone looking for anything to do with
 * their calendar finds both in one place, and seeing them side by side is what
 * makes the directions obvious without either needing to explain itself.
 *
 * What is asked for is a read-only subscription address, which every calendar
 * publishes and none of them calls the same thing, so the directions name it in
 * each app's own words. Nothing is written back to the calendar and nothing but
 * times is read out of it.
 */
export function CalendarConnect({ status }: { status: CalendarStatus }) {
  const [url, setUrl] = useState('');
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  // The status shown here is a server-component prop. revalidatePath marks the
  // route stale, but the refresh is what actually pulls the new props into this
  // already-mounted component — without it the card still says "not connected"
  // straight after connecting. Same pattern as AvailabilityGrid.
  const router = useRouter();

  function connect() {
    const value = url.trim();
    if (!value) {
      toast.error('Paste your calendar’s secret address first.');
      return;
    }
    startTransition(async () => {
      const result = await connectCalendar(value);
      if (!result.ok) {
        toast.error(result.error ?? 'That calendar could not be connected.', result.code);
        return;
      }
      setUrl('');
      router.refresh();
      toast.success(
        result.slots
          ? `Calendar connected — ${result.slots} busy ${result.slots === 1 ? 'slot' : 'slots'} this week.`
          : 'Calendar connected. Nothing busy in the week ahead.',
      );
    });
  }

  function refresh() {
    startTransition(async () => {
      const result = await syncCalendar();
      if (!result.ok) {
        toast.error(result.error ?? 'That calendar could not be refreshed.', result.code);
        return;
      }
      router.refresh();
      toast.success('Calendar refreshed.');
    });
  }

  async function disconnect() {
    const ok = await confirm({
      title: 'Disconnect this calendar?',
      body: 'Switchboard will forget the address and the busy times it worked out from it. Your calendar itself is untouched.',
      confirmLabel: 'Disconnect',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await disconnectCalendar();
      if (!result.ok) {
        toast.error(result.error ?? 'That didn’t disconnect.', result.code);
        return;
      }
      router.refresh();
      toast.success('Calendar disconnected.');
    });
  }

  if (status.connected) {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">
            Connected{status.sourceHost ? ` to ${status.sourceHost}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {status.lastStatus === 'ok'
              ? `Last read ${status.lastSyncedAt ? formatRelative(status.lastSyncedAt) : 'just now'}. Only busy times are read — never what anything is called.`
              : 'The last read didn’t work. Refresh to try again, or disconnect and paste a fresh address.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={refresh} disabled={pending} variant="secondary">
            Refresh now
          </Button>
          <Button type="button" onClick={disconnect} disabled={pending} variant="ghost">
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Connect your calendar</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          Then a plan’s “when is everyone free” grid starts filled in, instead of blank.
          Switchboard reads <strong>busy times only</strong> — never titles, locations, or
          who else is invited — and never writes anything back.
        </p>
      </div>
      <label className="block">
        <span className="sr-only">Your calendar’s secret address</span>
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/basic.ics"
          className="w-full rounded-btn border-2 border-line bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta"
        />
      </label>
      <Button type="button" onClick={connect} disabled={pending}>
        {pending ? 'Reading your calendar…' : 'Connect calendar'}
      </Button>
      {/* Named in each app's own words, because none of them agrees on what to
          call this and a single generic instruction sends most people hunting. */}
      <details className="text-xs text-ink-faint">
        <summary className="cursor-pointer font-semibold text-terracotta">
          Where do I find that address?
        </summary>
        <ul className="mt-2 space-y-1.5 pl-4">
          <li className="list-disc">
            <strong>Google Calendar</strong> — Settings → your calendar → “Secret address in iCal
            format”.
          </li>
          <li className="list-disc">
            <strong>Apple / iCloud</strong> — right-click the calendar → Share Calendar → Public
            Calendar, then copy the link.
          </li>
          <li className="list-disc">
            <strong>Outlook</strong> — Settings → Calendar → Shared calendars → Publish a calendar,
            and take the ICS link.
          </li>
        </ul>
        <p className="mt-2">
          Treat it like a password: anyone with that address can read the calendar. Disconnecting
          here makes Switchboard forget it, and your calendar’s own settings can revoke it outright.
        </p>
      </details>
    </div>
  );
}
