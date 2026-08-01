'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import {
  NOTIFICATION_CATEGORIES,
  type NotificationPrefs,
} from '@/lib/notifications';
import { updateNotificationPrefs } from '@/lib/actions/profile';
import { useSettingsSave } from '@/app/settings/SettingsSaveBar';

function prefsEqual(a: NotificationPrefs, b: NotificationPrefs): boolean {
  return NOTIFICATION_CATEGORIES.every((category) => a[category.key] === b[category.key]);
}

/**
 * The per-category notification switches, plus an "everything" master that
 * flips them all at once. Edits are held locally and committed through the
 * shared Settings save bar (Save / Cancel), so a toggle no longer writes until
 * you confirm it. If a save fails we surface a note and leave the section dirty
 * so the bar stays up for a retry.
 */
export function NotificationPreferences({
  initial,
}: {
  initial: NotificationPrefs;
}) {
  const { register, setDirty } = useSettingsSave();
  const id = useId();
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [baseline, setBaseline] = useState<NotificationPrefs>(initial);
  const [error, setError] = useState(false);

  // Ref mirrors so the registered save/cancel closures always see the latest
  // draft and baseline without re-registering.
  const prefsRef = useRef(prefs);
  const baselineRef = useRef(baseline);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);

  useEffect(() => {
    return register(id, {
      save: async () => {
        const next = prefsRef.current;
        setError(false);
        const result = await updateNotificationPrefs(next);
        if (result.ok) {
          setBaseline(next);
          setDirty(id, false);
        } else {
          setError(true);
          // Keep this section dirty so the save bar stays up for a retry.
        }
        return result;
      },
      cancel: () => {
        setPrefs(baselineRef.current);
        setError(false);
        setDirty(id, false);
      },
    });
  }, [id, register, setDirty]);

  const update = useCallback(
    (next: NotificationPrefs) => {
      setPrefs(next);
      setError(false);
      setDirty(id, !prefsEqual(next, baselineRef.current));
    },
    [id, setDirty],
  );

  const allOn = NOTIFICATION_CATEGORIES.every((c) => prefs[c.key]);

  function setAll(value: boolean) {
    // Derived from the category list, never a hand-written literal — a new
    // category must be swept by the master switch the day it ships.
    update(
      Object.fromEntries(
        NOTIFICATION_CATEGORIES.map((c) => [c.key, value]),
      ) as NotificationPrefs,
    );
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
                  update({ ...prefs, [category.key]: value })
                }
                label={`${on ? 'Turn off' : 'Turn on'} ${category.label}`}
              />
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="pt-2 text-xs font-semibold text-rose-deep" aria-live="polite">
          Couldn’t save — check your connection and try again.
        </p>
      )}
    </div>
  );
}
