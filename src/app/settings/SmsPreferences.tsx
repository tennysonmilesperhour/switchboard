'use client';
import { useState, useTransition } from 'react';
import { updateSmsPreferences } from '@/lib/actions/sms-preferences';

export function SmsPreferences({ initial, verified }: { initial: { enabled: boolean; plans: boolean; reminders: boolean } | null; verified: boolean }) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [plans, setPlans] = useState(initial?.plans ?? true);
  const [reminders, setReminders] = useState(initial?.reminders ?? true);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  return <section className="space-y-3 border-t border-line pt-4">
    <h3 className="font-bold text-ink">Text messages</h3>
    <p className="text-sm text-ink-soft">Optional Switchboard invitations and important plan updates at your verified phone number. Verification alone does not subscribe you. Message frequency varies; message and data rates may apply. Reply STOP to unsubscribe or HELP for help. No marketing.</p>
    {!verified && <p className="text-sm">Verify your current phone number above before subscribing.</p>}
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={!verified || pending} onChange={e => setEnabled(e.target.checked)} />I agree to receive these text messages.</label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={plans} disabled={pending} onChange={e => setPlans(e.target.checked)} />Invitations and important plan changes</label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={reminders} disabled={pending} onChange={e => setReminders(e.target.checked)} />Event reminders</label>
    <p className="text-xs text-ink-soft">Your quiet hours apply. Without custom quiet hours, texts wait between 10pm and 8am in your profile timezone. Old reminders expire instead of arriving late. In-app notifications remain available.</p>
    <p className="text-xs"><a href="/sms-compliance" className="underline">SMS terms</a> · <a href="/privacy" className="underline">Privacy</a></p>
    <button type="button" disabled={pending} className="rounded-full border border-line px-4 py-2 text-sm font-semibold" onClick={() => startTransition(async () => {
      setMessage('');
      try { const result = await updateSmsPreferences(enabled, plans, reminders); setMessage(result.ok ? 'SMS preferences saved.' : `${result.error} ${'code' in result ? result.code : ''}`); }
      catch { setMessage('Could not save SMS preferences. SB-SMS-PREFERENCES'); }
    })}>{pending ? 'Saving…' : 'Save SMS preferences'}</button>
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
