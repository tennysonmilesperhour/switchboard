'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { giveSpace, stopGivingSpace } from '@/lib/actions/connections';

interface GiveSpaceButtonProps {
  targetId: string;
  /** First name or display name, for the explanatory line. */
  name: string;
  /** Whether the viewer is already giving this person space. */
  avoided: boolean;
}

/**
 * Ask for space from the person whose profile you are looking at.
 *
 * This control existed only in `/people`, which lists people you are
 * **connected to**. So the person most worth avoiding — someone you are not
 * friends with who keeps turning up on plans you are on — was the one person
 * you could not avoid. And since the event page's heads-up only fires for
 * someone already on your avoid list, they could never trigger a warning
 * either: the safety feature was unreachable for exactly the case it exists
 * for.
 *
 * Give Space is **warn, never remove** (see the `profile_avoids` migration and
 * `giveSpace`). Nothing here hides anyone from anyone — it turns on the private
 * heads-up on plans the viewer opens, and nothing else.
 *
 * Wording and styling deliberately match the `/people` control: this is one
 * feature in two places, and a safety control that looks or reads differently
 * depending on where you found it is one people hesitate to use.
 */
export function GiveSpaceButton({ targetId, name, avoided }: GiveSpaceButtonProps) {
  // Local state so the control answers immediately, the same way ConnectButton
  // does; router.refresh() reconciles the server's view behind it.
  const [giving, setGiving] = useState(avoided);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const firstName = name.split(' ')[0];

  function toggle() {
    const next = !giving;
    setGiving(next);
    startTransition(async () => {
      try {
        const result = next ? await giveSpace(targetId) : await stopGivingSpace(targetId);
        if (!result.ok) {
          setGiving(!next);
          toast.error(result.error ?? 'Could not change that.', result.code);
          return;
        }
        router.refresh();
      } catch {
        // A rejected action never reaches the branch above. Put the control
        // back where it was rather than leaving it showing a state the server
        // does not have — a safety control that lies about being on is worse
        // than one that is plainly off.
        setGiving(!next);
        toast.error('Could not change that. Try again.');
      }
    });
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        aria-pressed={giving}
        className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
          giving ? 'bg-gold-soft text-gold-deep' : 'text-ink-faint hover:text-ink'
        }`}
      >
        <Icon name={giving ? 'check' : 'bell'} size={14} />
        {giving ? 'Giving space' : 'Give space'}
      </button>
      <p className="mt-1 max-w-xs text-center text-[11px] leading-snug text-ink-faint">
        {giving
          ? `We’ll quietly warn you if ${firstName} is somewhere you’re headed. They’re never told.`
          : 'A private heads-up before plans where they’ll be - no block, and they’re never notified.'}
      </p>
    </div>
  );
}
