'use client';

/**
 * Accessible on/off switch. A real `role="switch"` button (not a checkbox) so
 * it reads as "toggle" to screen readers and keyboard users, with the same
 * terracotta accent the rest of Settings uses. Controlled: pass `checked` and
 * handle `onCheckedChange`.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name when the switch isn't wrapped by a visible <label>. */
  label?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-terracotta' : 'bg-line'
      }`}
    >
      <span
        aria-hidden
        className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
