'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The profile's time zone, which quiet hours, the daily summary and text
 * messages all read. It used to be set once, silently, at onboarding and never
 * shown again, so someone who moved (or signed up on a laptop set to UTC) had
 * quiet hours that fell at the wrong time with no way to see why.
 *
 * A plain select inside the Settings form: a change dispatches the native
 * `change` event the save bar listens for, including the "use this device"
 * shortcut, so it is saved, cancelled and warned about like everything else.
 */
export function TimeZoneSelect({
  name,
  id,
  initial,
  zones,
}: {
  name: string;
  id: string;
  initial: string;
  zones: string[];
}) {
  const [value, setValue] = useState(initial);
  const [deviceZone, setDeviceZone] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const pendingNotify = useRef(false);

  // Read after mount: the server cannot know the device's zone, and rendering
  // it during hydration would mismatch.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
      } catch {
        setDeviceZone(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A value set from code fires no event of its own, so tell the form after
  // React has committed it — the save bar compares the form's values.
  useEffect(() => {
    if (!pendingNotify.current) return;
    pendingNotify.current = false;
    selectRef.current?.dispatchEvent(new Event('change', { bubbles: true }));
  }, [value]);

  // The saved zone and the device's own are always offered, even when this
  // runtime's list spells them differently (Asia/Kolkata vs Asia/Calcutta).
  const options = [...new Set([value, ...(deviceZone ? [deviceZone] : []), ...zones])];
  const offerDevice = deviceZone && deviceZone !== value;

  return (
    <div className="space-y-1.5">
      <select
        ref={selectRef}
        id={id}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm"
      >
        {options.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
      {offerDevice && (
        <p className="text-xs text-ink-soft">
          This device is set to {deviceZone.replaceAll('_', ' ')}.{' '}
          <button
            type="button"
            onClick={() => {
              pendingNotify.current = true;
              setValue(deviceZone);
            }}
            className="font-bold text-terracotta-deep underline underline-offset-2"
          >
            Use it
          </button>
        </p>
      )}
    </div>
  );
}
