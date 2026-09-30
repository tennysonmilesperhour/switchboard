'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  deleteBoard,
  leaveBoard,
  setBoardMemberRole,
  updateBoardDetails,
} from '@/lib/actions/boards';
import type { BoardMemberRow } from './BoardClient';

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-pill px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta';

/** "Make moderator" / "Make member" beside a neighbor, for moderators. */
export function BoardRoleButton({
  boardId,
  member,
  disabled,
}: {
  boardId: string;
  member: BoardMemberRow;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const next = member.role === 'moderator' ? 'member' : 'moderator';

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setBoardMemberRole(boardId, member.id, next);
          if (!result.ok) {
            toast.error(result.error ?? 'Could not change their role.', result.code);
            return;
          }
          toast.success(
            next === 'moderator'
              ? `${member.name} can now help run the board.`
              : `${member.name} is a neighbor again.`,
          );
          router.refresh();
        })
      }
      className={`${LINK_CLASS} font-semibold text-terracotta-deep`}
    >
      {next === 'moderator' ? 'make moderator' : 'make member'}
    </button>
  );
}

/**
 * Leaving, renaming and deleting a board. There were none: a board lasted as
 * long as its founder's account, under the name it was born with, and a
 * neighbor who wanted out had no button for it.
 */
export function BoardSettings({
  boardId,
  name: initialName,
  description: initialDescription,
  isModerator,
  canDelete,
  soleModerator,
  memberCount,
}: {
  boardId: string;
  name: string;
  description: string | null;
  isModerator: boolean;
  /** The founder, or any moderator once the founder has left. */
  canDelete: boolean;
  /** The reader is the only moderator: leaving needs a successor first. */
  soleModerator: boolean;
  memberCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const result = await updateBoardDetails(boardId, { name, description });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save the board.', result.code);
        return;
      }
      toast.success('Board updated.');
      setEditing(false);
      router.refresh();
    });
  }

  async function leave() {
    // Ask before the transition starts. Updates made inside an async
    // transition are held until the whole action settles, so a dialog opened
    // in there never paints and the action waits on an answer nobody can give.
    const ok = await confirm({
      title: `Leave ${initialName}?`,
      body: 'You’ll stop seeing its posts. A moderator can add you back, or you can rejoin with an invite link.',
      confirmLabel: 'Leave board',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await leaveBoard(boardId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not leave the board.', result.code);
        return;
      }
      toast.success(`You left ${initialName}.`);
      router.push('/boards');
    });
  }

  async function remove() {
    // Ask before the transition starts. Updates made inside an async
    // transition are held until the whole action settles, so a dialog opened
    // in there never paints and the action waits on an answer nobody can give.
    const ok = await confirm({
      title: `Delete ${initialName}?`,
      body: `Every post goes, and all ${memberCount} ${memberCount === 1 ? 'neighbor loses' : 'neighbors lose'} access. This can’t be undone.`,
      confirmLabel: 'Delete board',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteBoard(boardId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete the board.', result.code);
        return;
      }
      toast.success('Board deleted.');
      router.push('/boards');
    });
  }

  const onlyOneHere = memberCount <= 1;

  return (
    <section aria-busy={pending}>
      <SectionHeader title="This board" />
      <Card className="space-y-3">
        {isModerator &&
          (editing ? (
            <div className="space-y-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                aria-label="Board name"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={280}
                rows={2}
                aria-label="Board description"
                placeholder="What it’s for (optional)"
                className="w-full resize-none rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={save}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`${LINK_CLASS} font-bold text-terracotta-deep`}
            >
              Rename or describe the board
            </button>
          ))}

        {soleModerator && !onlyOneHere ? (
          <p className="text-xs leading-relaxed text-ink-faint">
            You’re the only moderator, so before you can leave, make someone else a
            moderator from the neighbors list — otherwise nobody could invite
            people or look after posts.
          </p>
        ) : soleModerator && onlyOneHere ? (
          <p className="text-xs leading-relaxed text-ink-faint">
            You’re the only one here. Delete the board if you’re done with it.
          </p>
        ) : (
          <button
            type="button"
            onClick={leave}
            disabled={pending}
            className={`${LINK_CLASS} font-semibold text-ink-faint hover:text-rose-deep`}
          >
            Leave this board
          </button>
        )}

        {canDelete && (
          <div className="border-t border-line pt-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={`${LINK_CLASS} font-bold text-rose-deep`}
            >
              Delete this board
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}
