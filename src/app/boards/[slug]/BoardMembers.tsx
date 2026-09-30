'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Card, SectionHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { errorRef, type ErrorCode } from '@/lib/errors';
import {
  ensureBoardInviteLink,
  inviteToBoard,
  removeFromBoard,
  rotateBoardInviteLink,
} from '@/lib/actions/boards';
import { BoardRoleButton } from './BoardSettings';
import type { BoardMemberRow } from './BoardClient';

/** Member actions: text links, but 44px tall so a thumb can hit them. */
const ACTION_CLASS =
  'inline-flex min-h-11 items-center rounded-pill px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta';

/**
 * The board's neighbors: who is on it, with a link to each profile, and — for
 * moderators — making co-moderators, removing people, and inviting by handle
 * or link. The founder can only be stepped down or removed by themselves.
 */
export function BoardMembers({
  boardId,
  slug,
  currentUserId,
  isModerator,
  isFounder,
  members,
}: {
  boardId: string;
  slug: string;
  currentUserId: string;
  isModerator: boolean;
  isFounder: boolean;
  members: BoardMemberRow[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [inviteHandle, setInviteHandle] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteErrorCode, setInviteErrorCode] = useState<ErrorCode | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function removeNeighbor(member: BoardMemberRow) {
    const ok = await confirm({
      title: `Remove ${member.name} from the board?`,
      body: 'They’ll lose access to this neighborhood board.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        const result = await removeFromBoard(boardId, member.id);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not remove that neighbor.', result.code);
          return;
        }
        toast.success(`${member.name} is off the board.`);
        router.refresh();
      } catch {
        toast.error('Could not remove that neighbor. Try again.');
      }
    });
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteHandle.trim()) return;
    setInviteError(null);
    setInviteErrorCode(null);
    startTransition(async () => {
      const handle = inviteHandle.trim().replace(/^@/, '');
      const result = await inviteToBoard(boardId, inviteHandle);
      if (result.ok) {
        setInviteHandle('');
        toast.success(`Added @${handle}. They’ve been told.`);
        router.refresh();
      } else {
        setInviteError(result.error ?? 'Could not add them.');
        setInviteErrorCode(result.code ?? null);
      }
    });
  }

  function createLink() {
    startTransition(async () => {
      const result = await ensureBoardInviteLink(boardId);
      if (result.ok && result.url) setInviteUrl(result.url);
      else toast.error(result.error ?? 'Could not create an invite link.', result.code);
    });
  }

  function rotateLink() {
    startTransition(async () => {
      const result = await rotateBoardInviteLink(boardId);
      if (result.ok && result.url) {
        setInviteUrl(result.url);
        toast.success('New link ready. The old one no longer works.');
      } else {
        toast.error(result.error ?? 'Could not refresh the link.', result.code);
      }
    });
  }

  return (
    <section>
      <SectionHeader
        title="Neighbors"
        hint={isModerator ? 'Invite-only - you moderate this board' : undefined}
      />
      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-3 rounded-card bg-card border border-line px-3.5 py-2.5"
          >
            <Avatar name={member.name} seed={member.id} size="sm" />
            <span className="min-w-0 flex-1 font-medium">
              {member.handle && member.id !== currentUserId ? (
                <Link
                  href={`/u/${encodeURIComponent(member.handle)}?from=/boards/${slug}`}
                  className="hover:text-terracotta-deep"
                >
                  {member.name}
                </Link>
              ) : (
                member.name
              )}
              {member.role === 'moderator' && (
                <span className="ml-1.5 text-xs text-gold-deep rounded-pill bg-gold-soft px-1.5 py-0.5">
                  {member.founder ? 'founder' : 'moderator'}
                </span>
              )}
            </span>
            {isModerator && member.id !== currentUserId && (!member.founder || isFounder) && (
              <BoardRoleButton boardId={boardId} member={member} disabled={pending} />
            )}
            {isModerator && member.id !== currentUserId && !member.founder && (
              <button
                type="button"
                onClick={() => removeNeighbor(member)}
                disabled={pending}
                className={`${ACTION_CLASS} text-ink-faint hover:text-rose-deep`}
              >
                remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {isModerator && (
        <form onSubmit={invite} className="flex items-center gap-2 mt-3">
          <div className="flex flex-1 items-center rounded-card border border-line bg-card focus-within:border-terracotta transition-colors">
            <span className="pl-3.5 text-ink-faint text-sm">@</span>
            <input
              value={inviteHandle}
              onChange={(e) => setInviteHandle(e.target.value.toLowerCase())}
              placeholder="handle"
              aria-label="Invite by handle"
              className="flex-1 bg-transparent px-1.5 py-2.5 text-sm outline-none lowercase"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending || !inviteHandle.trim()}
          >
            Invite
          </Button>
        </form>
      )}
      {inviteError && (
        <p role="alert" className="text-xs text-rose-deep mt-2">
          {inviteError}
          {inviteErrorCode && <span className="ml-2 opacity-70">{errorRef(inviteErrorCode)}</span>}
        </p>
      )}

      {isModerator && (
        <div className="mt-3">
          {inviteUrl ? (
            <Card tone="cream" className="space-y-2.5">
              <p className="text-sm text-ink-soft leading-relaxed">
                Share this link. Anyone who opens it while signed in joins the
                board as a neighbor.
              </p>
              <div className="flex items-center gap-2 rounded-card border border-line bg-paper px-3 py-2.5">
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate rounded text-sm font-semibold text-terracotta-deep underline decoration-terracotta/40 underline-offset-2 hover:text-terracotta-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  title={inviteUrl}
                >
                  {inviteUrl}
                </a>
                <CopyButton text={inviteUrl} />
              </div>
              <button
                type="button"
                onClick={rotateLink}
                disabled={pending}
                className="text-xs font-bold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta rounded-pill px-1"
              >
                Replace with a new link
              </button>
            </Card>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={createLink}
            >
              {pending ? 'Creating…' : 'Create a shareable invite link 🔗'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
