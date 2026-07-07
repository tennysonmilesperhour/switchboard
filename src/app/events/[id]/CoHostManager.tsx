'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { addCoHost, removeCoHost } from '@/lib/actions/events';

interface CoHostManagerProps {
  eventId: string;
  cohosts: Array<{ id: string; name: string }>;
}

/** Primary-host-only panel to share host powers with a friend by handle. */
export function CoHostManager({ eventId, cohosts }: CoHostManagerProps) {
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const value = handle.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      const result = await addCoHost(eventId, value);
      if (result.ok) {
        setHandle('');
        router.refresh();
      } else {
        setError(result.error ?? 'Could not add that co-host.');
      }
    });
  }

  return (
    <section className="border-t border-line pt-5">
      <h2 className="font-display text-xl text-ink">Co-hosts</h2>
      <p className="text-sm text-ink-faint mt-0.5 mb-3">
        Co-hosts share your powers — editing the plan, approving join requests,
        and confirming or cancelling. Only you can manage this list.
      </p>

      {cohosts.length > 0 && (
        <ul className="space-y-2 mb-3">
          {cohosts.map((cohost) => (
            <li
              key={cohost.id}
              className="flex items-center gap-3 rounded-card bg-card border border-line px-3.5 py-2.5"
            >
              <Avatar name={cohost.name} seed={cohost.id} size="sm" />
              <span className="flex-1 font-medium">{cohost.name}</span>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await removeCoHost(eventId, cohost.id);
                    router.refresh();
                  })
                }
                disabled={pending}
                className="text-xs text-ink-faint hover:text-rose-deep"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex items-center gap-2">
        <div className="flex flex-1 items-center rounded-card border border-line bg-card focus-within:border-terracotta transition-colors">
          <span className="pl-3.5 text-ink-faint text-sm">@</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="handle"
            aria-label="Co-host handle"
            className="flex-1 bg-transparent px-1.5 py-2.5 text-sm outline-none lowercase"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !handle.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="text-xs text-rose-deep mt-2">{error}</p>}
    </section>
  );
}
