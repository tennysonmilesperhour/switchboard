'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * A settings form that saves itself. Any change bubbling up (native inputs, or
 * the synthetic `input` event the InterestPicker dispatches) is debounced and
 * submitted through the same server action a Save button would have used — so
 * there's no separate "did I save?" step. Text edits settle on a pause; toggles
 * and selects effectively save on change.
 */
export function AutosaveForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => form.requestSubmit(), 600);
    };
    form.addEventListener('input', schedule);
    form.addEventListener('change', schedule);
    return () => {
      form.removeEventListener('input', schedule);
      form.removeEventListener('change', schedule);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <form ref={ref} action={action} className={className}>
      {children}
    </form>
  );
}

/**
 * Inline status for an AutosaveForm. Mirrors SaveButton's confirmation, minus
 * the button — the save is automatic, so we just report what's happening.
 */
export function AutosaveStatus() {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setSaved(true);
      const timer = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <p className="text-xs font-semibold text-ink-faint" aria-live="polite">
      {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Changes save automatically'}
    </p>
  );
}
