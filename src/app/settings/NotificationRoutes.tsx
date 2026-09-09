'use client';
import { useState, useTransition } from 'react';
import { updateNotificationRoutes } from '@/lib/actions/sms-preferences';

export function NotificationRoutes({ initial, urgent, smsEnabled, emailVerified }: { initial: { plans: string; reminders: string } | null; urgent: boolean; smsEnabled: boolean; emailVerified: boolean }) {
  const [plans, setPlans] = useState(initial?.plans ?? 'existing');
  const [reminders, setReminders] = useState(initial?.reminders ?? 'existing');
  const [allowUrgent, setAllowUrgent] = useState(urgent);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  return <section className="space-y-3 border-t border-line py-5">
    <h3 className="font-bold">How plan alerts reach you</h3>
    <p className="text-sm text-ink-soft">Choose one external channel for each category to avoid duplicate alerts. Everything stays in your in-app inbox. Email arrives immediately; SMS and push follow quiet hours. Existing settings keeps your current combination.</p>
    {([['plans', 'Invitations and plan updates', plans, setPlans], ['reminders', 'Event reminders', reminders, setReminders]] as const).map(([key, label, value, change]) => <label key={key} className="block text-sm font-medium">{label}
      <select className="mt-1 block w-full rounded-card border border-line bg-paper px-3 py-2" value={value} disabled={pending} onChange={event => change(event.target.value)}>
        <option value="existing">Existing settings</option><option value="push">Push only</option>
        <option value="sms" disabled={!smsEnabled}>SMS only{!smsEnabled ? ' — subscribe above first' : ''}</option>
        <option value="email" disabled={!emailVerified}>Email only{!emailVerified ? ' — verify email first' : ''}</option>
        <option value="in_app">In-app inbox only</option>
      </select>
    </label>)}
    <p className="text-xs text-ink-soft">Push also requires permission on your device and the category enabled above. Selecting SMS enables that text category.</p>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={allowUrgent} disabled={pending || !smsEnabled || !['sms', 'existing'].includes(plans)} onChange={e => setAllowUrgent(e.target.checked)} />Allow time or location changes for plans starting within two hours to reach me by SMS during quiet hours.</label>
    <p className="text-xs text-ink-soft">Off by default. Applies only to plans you accepted, and only while SMS plan alerts are enabled. Invitations, announcements and reminders still wait.</p>
    <button type="button" disabled={pending} className="rounded-full border border-line px-4 py-2 text-sm font-semibold" onClick={() => startTransition(async () => {
      setMessage('');
      try { const result = await updateNotificationRoutes(plans, reminders, allowUrgent && smsEnabled && ['sms', 'existing'].includes(plans)); setMessage(result.ok ? 'Notification channels saved.' : `${result.error} ${'code' in result ? result.code : ''}`); }
      catch { setMessage('Could not save notification channels. SB-SMS-PREFERENCES'); }
    })}>{pending ? 'Saving…' : 'Save notification channels'}</button>
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
