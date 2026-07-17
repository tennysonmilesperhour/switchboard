'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@/components/ui/Switch';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationPrefs,
} from '@/lib/notifications';
import { updateNotificationPrefs } from '@/lib/actions/profile';

/**
 * The per-category notification switches, plus an "everything" master that
 * flips them all at once. Optimistic: the UI moves immediately and the save
 * runs in the background, so toggling never feels laggy. If a save fails we
 * roll the row back to what the server last confirmed and surface a note.
 */
export function NotificationPreferences({
  initial,
}: {
  initial: NotificationPrefs;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [confirmed, setConfirmed] = useState<NotificationPrefs>(initial);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const allOn = NOTIFICATION_CATEGORIES.every((c) => prefs[c.key]);

  function persist(next: NotificationPrefs) {
    const previous = confirmed;
    setPrefs(next);
    setError(false);
    startTransition(async () => {
      const result = await updateNotificationPrefs(next);
      if (result.ok) {
        setConfirmed(next);
      } else {
        setPrefs(previous);
        setError(true);
      }
    });
  }

  function setAll(value: boolean) {
    persist({ plans: value, reminders: value, messages: value, social: value });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4 pb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">What to notify me about</p>
          <p className="mt-0.5 text-sm text-ink-soft leading-relaxed">
            Choose what sends a push. Everything still appears in your{' '}
            notifications feed.
          </p>
        </div>
        <Switch
          checked={allOn}
          onCheckedChange={setAll}
          label={allOn ? 'Turn all notifications off' : 'Turn all notifications on'}
        />
      </div>

      <ul className="divide-y divide-line border-t border-line">
        {NOTIFICATION_CATEGORIES.map((category) => {
          const on = prefs[category.key];
          return (
            <li
              key={category.key}
              className="flex items-start justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  <span aria-hidden className="mr-1.5">
                    {category.emoji}
                  </span>
                  {category.label}
                </p>
                <p className="mt-0.5 text-xs text-ink-faint leading-relaxed">
                  {category.description}
                </p>
              </div>
              <Switch
                checked={on}
                onCheckedChange={(value) =>
                  persist({ ...prefs, [category.key]: value })
                }
                label={`${on ? 'Turn off' : 'Turn on'} ${category.label}`}
              />
            </li>
          );
        })}
      </ul>

      <p
        className="pt-2 text-xs font-semibold text-ink-faint"
        aria-live="polite"
      >
        {error
          ? 'Couldn’t save — check your connection and try again.'
          : pending
            ? 'Saving…'
            : 'Changes save automatically'}
      </p>
    </div>
  );
}
