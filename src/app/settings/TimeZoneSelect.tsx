'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { canonicalZone, timeZoneOptions, type TimeZoneOption } from '@/lib/time-zones';

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
  options: serverOptions,
}: {
  name: string;
  id: string;
  initial: string;
  /** Built on the server, so hydration renders exactly what the server did. */
  options: TimeZoneOption[];
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

  // The server's list already holds the saved zone. The device's own zone is
  // only known after mount; if the list spells it differently (Asia/Kolkata vs
  // Asia/Calcutta), it is offered as spelled, ahead of the rest.
  const options = useMemo(() => {
    const exact = new Set(serverOptions.map((option) => option.value));
    const extra = [value, deviceZone].filter(
      (zone): zone is string => Boolean(zone) && !exact.has(zone as string),
    );
    if (extra.length === 0) return serverOptions;
    const added = timeZoneOptions([], extra);
    const rest = serverOptions.filter(
      (option) => !added.some((a) => canonicalZone(a.value) === canonicalZone(option.value)),
    );
    return [...added, ...rest];
  }, [serverOptions, value, deviceZone]);
  const offerDevice =
    deviceZone && canonicalZone(deviceZone) !== canonicalZone(value) ? deviceZone : null;

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
          <option key={zone.value} value={zone.value}>
            {zone.label}
          </option>
        ))}
      </select>
      {offerDevice && (
        <p className="text-xs text-ink-soft">
          This device is set to {canonicalZone(offerDevice).replaceAll('_', ' ')}.{' '}
          <button
            type="button"
            onClick={() => {
              pendingNotify.current = true;
              setValue(offerDevice);
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
