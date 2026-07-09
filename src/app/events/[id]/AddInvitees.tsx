'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { addPeopleToEvent } from '@/lib/actions/events';

export interface ConnectionOption {
  id: string;
  name: string;
  handle: string;
}

/**
 * Host/co-host panel to append more people to a live cascade. Add anyone by
 * handle, email, phone, or name — or tap friends straight from your people.
 * Everyone added joins the back of the line.
 */
export function AddInvitees({
  eventId,
  connections,
}: {
  eventId: string;
  connections: ConnectionOption[];
}) {
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const totalToAdd = entries.length + selected.length + (text.trim() ? 1 : 0);

  const availableConnections = useMemo(
    () => connections.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [connections],
  );

  function stage(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setError(null);
    setEntries((current) => (current.includes(value) ? current : [...current, value]));
    setText('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      stage(text);
    } else if (e.key === 'Backspace' && !text && entries.length > 0) {
      setEntries((current) => current.slice(0, -1));
    }
  }

  function toggleConnection(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function submit() {
    const staged = text.trim() ? [...entries, text.trim()] : entries;
    if (staged.length === 0 && selected.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await addPeopleToEvent(eventId, {
        entries: staged,
        profileIds: selected,
      });
      if (!result.ok) {
        setError(result.error ?? 'Could not add people.');
        return;
      }
      setText('');
      setEntries([]);
      setSelected([]);
      const added = result.added ?? 0;
      toast.success(
        `Added ${added} ${added === 1 ? 'person' : 'people'} to the flow.`,
      );
      if (result.skipped && result.skipped.length > 0) {
        setError(
          `Skipped ${result.skipped.map((s) => `${s.entry} (${s.reason})`).join(', ')}.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <section className="border-t border-line pt-5">
      <h2 className="font-display text-xl text-ink">Add people</h2>
      <p className="text-sm text-ink-faint mt-0.5 mb-3">
        Add anyone by <strong>@handle</strong>, email, phone, or name — or tap a
        friend below. They join the back of the line and go out when it’s their
        turn.
      </p>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {entries.map((entry) => (
            <Chip
              key={entry}
              selected
              onClick={() => setEntries((c) => c.filter((x) => x !== entry))}
            >
              {entry} ✕
            </Chip>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => stage(text)}
          placeholder="@handle, email, phone, or name"
          aria-label="Add someone by handle, email, phone, or name"
          className="flex-1 rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending || totalToAdd === 0}
          onClick={submit}
        >
          {totalToAdd > 0 ? `Add ${totalToAdd}` : 'Add'}
        </Button>
      </div>

      {availableConnections.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">
            From your people
          </p>
          <div className="flex flex-wrap gap-2">
            {availableConnections.map((connection) => (
              <Chip
                key={connection.id}
                selected={selected.includes(connection.id)}
                disabled={pending}
                onClick={() => toggleConnection(connection.id)}
              >
                {connection.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-deep mt-2.5">{error}</p>}
    </section>
  );
}
