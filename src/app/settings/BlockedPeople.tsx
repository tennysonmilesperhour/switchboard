'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { unblockProfile } from '@/lib/actions/connections';

export interface BlockedPerson {
  id: string;
  name: string;
  handle: string | null;
}

/**
 * Everyone you've blocked, with a way back. Before this list existed a block
 * could not be seen or undone from anywhere in the app, so a mistaken tap was
 * permanent.
 */
export function BlockedPeople({ people }: { people: BlockedPerson[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  async function unblock(person: BlockedPerson) {
    const ok = await confirm({
      title: `Unblock ${person.name}?`,
      body: 'They can find you and send a connection request again. You won’t be reconnected automatically, and they won’t be told.',
      confirmLabel: 'Unblock',
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await unblockProfile(person.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not unblock them.', result.code);
        return;
      }
      toast.success(`${person.name} is unblocked.`);
      router.refresh();
    });
  }

  if (people.length === 0) {
    return <p className="text-sm text-ink-faint">You haven’t blocked anyone.</p>;
  }

  return (
    <ul className="space-y-2" aria-busy={pending}>
      {people.map((person) => (
        <li key={person.id} className="flex items-center gap-3">
          <Avatar name={person.name} seed={person.id} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{person.name}</span>
            {person.handle && (
              <span className="block truncate text-xs text-ink-faint">@{person.handle}</span>
            )}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => unblock(person)}
            className="shrink-0 rounded-pill border border-line px-3 py-1.5 text-xs font-bold text-ink-soft hover:border-terracotta hover:text-terracotta-deep disabled:opacity-50"
          >
            Unblock
          </button>
        </li>
      ))}
    </ul>
  );
}
