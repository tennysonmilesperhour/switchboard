'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/Button';

/**
 * Submit button for the settings server-action forms. Shows a pending state
 * while saving and a brief confirmation after, so a Save never feels like it
 * did nothing.
 */
export function SaveButton() {
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
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
    </Button>
  );
}
