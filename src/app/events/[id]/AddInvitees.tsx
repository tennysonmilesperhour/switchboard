'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { addInviteesByHandle } from '@/lib/actions/events';

const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

/**
 * Host/co-host panel to append more people to a live cascade. Handles are
 * collected as chips, then added in one go — each joins the back of the line.
 */
export function AddInvitees({ eventId }: { eventId: string }) {
  const [handle, setHandle] = useState('');
  const [handles, setHandles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function stage(raw: string) {
    const cleaned = raw.trim().toLowerCase().replace(/^@/, '');
    if (!cleaned) return;
    if (!HANDLE_PATTERN.test(cleaned)) {
      setError(`@${cleaned} isn’t a valid handle.`);
      return;
    }
    setError(null);
    setHandles((current) =>
      current.includes(cleaned) ? current : [...current, cleaned],
    );
    setHandle('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter or comma commits the current handle to the chip list.
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      stage(handle);
    } else if (e.key === 'Backspace' && !handle && handles.length > 0) {
      setHandles((current) => current.slice(0, -1));
    }
  }

  function submit() {
    // Fold in whatever is still typed in the box.
    const staged = handle.trim() ? [...handles, handle.trim().toLowerCase().replace(/^@/, '')] : handles;
    const unique = Array.from(new Set(staged));
    if (unique.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await addInviteesByHandle(eventId, unique);
      if (!result.ok) {
        setError(result.error ?? 'Could not add people.');
        return;
      }
      setHandle('');
      setHandles([]);
      const added = result.added ?? 0;
      const skippedCount = result.skipped?.length ?? 0;
      toast.success(
        `Added ${added} ${added === 1 ? 'person' : 'people'} to the flow.` +
          (skippedCount > 0 ? ` ${skippedCount} skipped.` : ''),
      );
      if (result.skipped && result.skipped.length > 0) {
        setError(
          result.skipped
            .map((s) => `@${s.handle}: ${s.reason}`)
            .join(' · '),
        );
      }
      router.refresh();
    });
  }

  return (
    <section className="border-t border-line pt-5">
      <h2 className="font-display text-xl text-ink">Add people</h2>
      <p className="text-sm text-ink-faint mt-0.5 mb-3">
        Invite more friends by handle. They join the back of the line and go out
        when it’s their turn.
      </p>

      {handles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {handles.map((h) => (
            <Chip key={h} selected onClick={() => setHandles((c) => c.filter((x) => x !== h))}>
              @{h} ✕
            </Chip>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center rounded-card border border-line bg-card focus-within:border-terracotta transition-colors">
          <span className="pl-3.5 text-ink-faint text-sm">@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            onKeyDown={onKeyDown}
            onBlur={() => stage(handle)}
            placeholder="handle"
            aria-label="Add someone by handle"
            className="flex-1 bg-transparent px-1.5 py-2.5 text-sm outline-none lowercase"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending || (handles.length === 0 && !handle.trim())}
          onClick={submit}
        >
          Add to flow
        </Button>
      </div>
      {error && <p className="text-xs text-rose-deep mt-2">{error}</p>}
    </section>
  );
}
