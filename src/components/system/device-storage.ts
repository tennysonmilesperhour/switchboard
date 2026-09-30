/**
 * Device-level preferences — the `sb-*` localStorage keys — read and written
 * without ever throwing.
 *
 * Storage access throws in Safari private windows, with site data blocked, and
 * in some in-app browsers. Unguarded, that turned "Show the checklist again"
 * and every "not now" button into a button that did nothing, and a read during
 * an effect into a crash. A preference that cannot be remembered on this
 * device should simply not be remembered.
 */
export function readDeviceFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeDeviceFlag(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered on this device; the choice still applies for this visit.
  }
}

export function clearDeviceFlag(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing stored, or nothing we can reach — either way, nothing to clear.
  }
}
