'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { leaveRoom, setRoomMuted } from '@/lib/actions/rooms';

export interface RoomMemberInfo {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
}

/**
 * Null when the room is open. Otherwise a block has made it read-only (D12);
 * `blockedByYou` names the people the *viewer* blocked, which they already
 * know. It is empty for the person who was blocked, and the copy for them never
 * says who did it.
 */
export type RoomReadOnly = { blockedByYou: string[] } | null;

interface RoomHeaderProps {
  roomId: string;
  roomKind: string;
  currentUserId: string;
  members: RoomMemberInfo[];
  muted: boolean;
  plan: { id: string; title: string } | null;
  canLeave: boolean;
  readOnly: RoomReadOnly;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Who is here, where this room came from, and the member's own controls (G30):
 * mute (D20: no notifications from this room) and leave (D20: match rooms, and
 * a plan's room once the plan is over).
 */
export function RoomHeader({
  roomId,
  roomKind,
  currentUserId,
  members,
  muted,
  plan,
  canLeave,
  readOnly,
}: RoomHeaderProps) {
  const [open, setOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const others = members.filter((member) => member.id !== currentUserId);
  const summary =
    others.length === 0
      ? 'Just you'
      : others.length <= 3
        ? joinNames(others.map((member) => member.name.split(' ')[0]))
        : `${others
            .slice(0, 2)
            .map((member) => member.name.split(' ')[0])
            .join(', ')} and ${others.length - 2} others`;

  function toggleMute() {
    const next = !isMuted;
    setIsMuted(next);
    startTransition(async () => {
      const result = await setRoomMuted(roomId, next);
      if (!result.ok) {
        setIsMuted(!next);
        toast.error(result.error ?? 'Could not change notifications for this room.', result.code);
        return;
      }
      toast.success(next ? 'Muted. This room won’t notify you.' : 'Unmuted.');
    });
  }

  async function leave() {
    const ok = await confirm({
      title: 'Leave this room?',
      body:
        roomKind === 'match' || roomKind === 'direct'
          ? 'It leaves your Rooms, and you won’t see anything new said here. The other person keeps what was already said.'
          : 'It leaves your Rooms, and you won’t see anything new said here. The plan itself isn’t affected.',
      confirmLabel: 'Leave',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await leaveRoom(roomId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not leave the room.', result.code);
        return;
      }
      router.push('/rooms');
    });
  }

  return (
    <div className="mb-2 space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        >
          <span className="flex shrink-0 -space-x-2" aria-hidden>
            {others.slice(0, 3).map((member) => (
              <Avatar
                key={member.id}
                name={member.name}
                seed={member.id}
                src={member.avatarUrl}
                size="xs"
                className="ring-2 ring-paper"
              />
            ))}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{summary}</span>
            <span className="block text-[11px] text-ink-faint">
              {members.length} {members.length === 1 ? 'person' : 'people'} · tap for details
            </span>
          </span>
        </button>
        {plan && (
          <Link
            href={`/events/${plan.id}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-pill px-3 text-xs font-semibold text-terracotta-deep hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            <Icon name="calendar" size={14} />
            The plan
          </Link>
        )}
        <button
          type="button"
          onClick={toggleMute}
          disabled={pending}
          aria-pressed={isMuted}
          aria-label={isMuted ? 'Unmute this room' : 'Mute this room'}
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
            isMuted ? 'bg-cream text-ink-faint' : 'text-ink-soft hover:bg-cream'
          }`}
        >
          <span className="relative inline-flex">
            <Icon name="bell" size={18} />
            {isMuted && (
              <span
                aria-hidden
                className="absolute left-1/2 top-1/2 h-0.5 w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-current"
              />
            )}
          </span>
        </button>
      </div>

      {open && (
        <div className="rounded-card border border-line bg-card p-3 animate-rise">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
            In this room
          </p>
          <ul className="space-y-1.5">
            {members.map((member) => {
              const label = member.id === currentUserId ? `${member.name} (you)` : member.name;
              return (
                <li key={member.id} className="flex items-center gap-2.5 text-sm">
                  <Avatar name={member.name} seed={member.id} src={member.avatarUrl} size="sm" />
                  {member.handle && member.id !== currentUserId ? (
                    <Link
                      href={`/u/${encodeURIComponent(member.handle)}?from=/rooms/${roomId}`}
                      className="min-w-0 truncate font-semibold hover:underline underline-offset-2"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate font-semibold">{label}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
            {isMuted
              ? 'Muted: this room won’t send you notifications. New messages still show here and in Rooms.'
              : 'You’ll be notified about new messages here unless you mute the room.'}
          </div>
          {canLeave ? (
            <button
              type="button"
              onClick={leave}
              disabled={pending}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-pill px-1 text-xs font-semibold text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              <Icon name="logout" size={14} />
              Leave this room
            </button>
          ) : (
            roomKind === 'event' && (
              <p className="mt-2 text-xs text-ink-faint">
                You can leave a plan’s room once the plan is over. Until then, mute it.
              </p>
            )
          )}
        </div>
      )}

      {readOnly && (
        <div role="status" className="rounded-card bg-cream px-3.5 py-2.5 text-sm text-ink-soft">
          {readOnly.blockedByYou.length > 0 ? (
            <>
              You blocked {joinNames(readOnly.blockedByYou)}, so this conversation is read-only
              for both of you. What was said stays here.{' '}
              <Link href="/settings" className="font-semibold text-terracotta-deep underline underline-offset-2">
                Blocked people are in Settings
              </Link>
              .
            </>
          ) : (
            'This conversation is read-only now. You can still read what was said, but nothing new can be added.'
          )}
        </div>
      )}
      {!readOnly && (roomKind === 'match' || roomKind === 'direct') && others.length === 0 && (
        <div role="status" className="rounded-card bg-cream px-3.5 py-2.5 text-sm text-ink-soft">
          The other person has left this room. What was said stays here for you.
        </div>
      )}
    </div>
  );
}
