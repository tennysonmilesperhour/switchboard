'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { subscribeAuthorized } from '@/lib/supabase/realtime';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useConfirm, usePrompt } from '@/components/ui/ConfirmDialog';
import {
  deleteMessage,
  loadEarlierMessages,
  markRoomRead,
  reportRoomMessage,
  sendMessage,
  sendPhotoMessage,
  signRoomMessagePhotos,
  toggleTask,
} from '@/lib/actions/rooms';
import { blockProfile } from '@/lib/actions/connections';
import { UploadError, uploadImage } from '@/lib/client/upload-image';
import { formatRelative } from '@/lib/format';
import type { RoomItemKind } from '@/lib/types';
import { MessageBubble } from './MessageBubble';
import { RoomHeader, type RoomMemberInfo, type RoomReadOnly } from './RoomHeader';
import { SplitTab, type ExpenseRow, type ExpenseShareRow } from './SplitTab';
import {
  mergeRoomMessages,
  OPTIMISTIC_PREFIX,
  prependEarlierMessages,
  type RoomMessage,
} from './room-messages';
import { Glyph } from '@/components/ui/Glyph';

export type { RoomMessage } from './room-messages';
export type { ExpenseRow } from './SplitTab';

export interface RoomItemRow {
  id: string;
  kind: RoomItemKind;
  title: string;
  detail: string | null;
  url: string | null;
  done: boolean;
  created_at: string;
}

type TabKey = 'chat' | 'split' | RoomItemKind;

const TABS: Array<{ key: TabKey; label: string; emoji: string }> = [
  { key: 'chat', label: 'Chat', emoji: '💬' },
  { key: 'address', label: 'Places', emoji: '📍' },
  { key: 'task', label: 'Tasks', emoji: '✓' },
  { key: 'link', label: 'Links', emoji: '🔗' },
  { key: 'photo', label: 'Photos', emoji: '📷' },
  { key: 'note', label: 'Notes', emoji: '📝' },
  { key: 'split', label: 'Split', emoji: '💸' },
];

const PHOTO_BODY = '📷 Photo';

interface RoomClientProps {
  roomId: string;
  roomKind: string;
  currentUserId: string;
  members: RoomMemberInfo[];
  /** Names for everyone who wrote here, including people who have left. */
  memberNames: Record<string, string>;
  initialMessages: RoomMessage[];
  /** Whether there are messages before the first page. */
  hasEarlier: boolean;
  items: RoomItemRow[];
  expenses: ExpenseRow[];
  shares: ExpenseShareRow[];
  muted: boolean;
  readOnly: RoomReadOnly;
  plan: { id: string; title: string } | null;
  canLeave: boolean;
  /** False when AI filing is unavailable and only the pattern rules run (G32). */
  smartFiling: boolean;
}

function parseRoomMessage(value: Record<string, unknown>): RoomMessage | null {
  if (
    typeof value.id !== 'string' ||
    typeof value.sender_id !== 'string' ||
    typeof value.body !== 'string' ||
    typeof value.created_at !== 'string' ||
    (value.image_url !== null && typeof value.image_url !== 'string')
  ) {
    return null;
  }
  return {
    id: value.id,
    sender_id: value.sender_id,
    body: value.body,
    image_url: value.image_url,
    created_at: value.created_at,
  };
}

export function RoomClient({
  roomId,
  roomKind,
  currentUserId,
  members,
  memberNames,
  initialMessages,
  hasEarlier,
  items,
  expenses,
  shares,
  muted,
  readOnly,
  plan,
  canLeave,
  smartFiling,
}: RoomClientProps) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  // A refresh hands down a new server read; fold it in rather than ignoring it,
  // so messages the realtime channel missed appear, deleted ones go, and a
  // realtime photo picks up its signed URL (see mergeRoomMessages).
  const [seenServerRead, setSeenServerRead] = useState(initialMessages);
  if (seenServerRead !== initialMessages) {
    setSeenServerRead(initialMessages);
    setMessages((current) => mergeRoomMessages(current, initialMessages));
  }
  const [moreBefore, setMoreBefore] = useState(hasEarlier);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [tab, setTab] = useState<TabKey>('chat');
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  // Text messages still on their way to the server. The bubble shows at once,
  // so closing the tab in that second would lose a message the reader saw sent.
  const [sending, setSending] = useState(0);
  useEffect(() => {
    if (sending === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sending]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const askReason = usePrompt();

  const memberIds = new Set(members.map((member) => member.id));
  // A match room the other person left has nobody to talk to.
  const alone = roomKind === 'match' && members.every((member) => member.id === currentUserId);
  const canWrite = !readOnly && !alone;
  const nameOf = (id: string) => memberNames[id] ?? 'Someone who left';

  useEffect(() => {
    markRoomRead(roomId).catch(() => undefined);
    // Only while the room is actually on screen. The notifier skips anyone who
    // marked the room read in the last 90 seconds, so a heartbeat that kept
    // beating in a background tab told it "they're watching" for as long as the
    // tab stayed open, and that person was never told about new messages.
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      markRoomRead(roomId).catch(() => undefined);
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        markRoomRead(roomId).catch(() => undefined);
        // Realtime does not replay what arrived while the phone was asleep.
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [roomId, router]);

  // Live updates (G12). New messages are appended in place; everything else —
  // filed items appearing *and being ticked*, expenses added or edited, shares
  // settled — re-reads the room, coalesced so a burst is one refresh. RLS on
  // each table decides which changes this member receives.
  useEffect(() => {
    const supabase = createClient();
    let joined = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, 300);
    };
    const roomFilter = `room_id=eq.${roomId}`;

    const signPhoto = (messageId: string) => {
      signRoomMessagePhotos(roomId, [messageId])
        .then((signed) => {
          if (!(messageId in signed)) return;
          setMessages((current) =>
            current.map((m) => (m.id === messageId ? { ...m, image_src: signed[messageId] } : m)),
          );
        })
        .catch(() => undefined);
    };

    let channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: roomFilter },
        (payload) => {
          const incoming = parseRoomMessage(payload.new);
          if (!incoming) return;
          setMessages((current) => {
            // Already have the real row (e.g. duplicate delivery) — ignore.
            if (current.some((m) => m.id === incoming.id)) return current;
            // Reconcile our own optimistic placeholder: it was appended with a
            // synthetic id, so it won't match the real UUID here. Swap the first
            // matching placeholder for the real row instead of appending a
            // second copy, keeping the local preview of a photo just sent.
            const placeholder = current.findIndex(
              (m) =>
                m.id.startsWith(OPTIMISTIC_PREFIX) &&
                m.sender_id === incoming.sender_id &&
                m.body === incoming.body,
            );
            if (placeholder === -1) return [...current, incoming];
            const next = [...current];
            const preview = current[placeholder].image_src;
            next[placeholder] = preview ? { ...incoming, image_src: preview } : incoming;
            return next;
          });
          // A realtime payload carries the stored path, which a browser cannot
          // load; ask the server for a signed URL for this one photo.
          if (incoming.image_url) signPhoto(incoming.id);
        },
      );
    // A sender deleting their own message. Realtime can't filter deletes by
    // room and only carries the deleted row's id, so drop it by id: an id from
    // another room matches nothing here.
    channel = channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => {
        const gone = (payload.old as { id?: unknown } | null)?.id;
        if (typeof gone !== 'string') return;
        setMessages((current) =>
          current.some((m) => m.id === gone) ? current.filter((m) => m.id !== gone) : current,
        );
      },
    );
    for (const table of ['room_items', 'expenses', 'expense_shares'] as const) {
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel = channel.on(
          'postgres_changes',
          { event, schema: 'public', table, filter: roomFilter },
          scheduleRefresh,
        );
      }
    }
    const stop = subscribeAuthorized(supabase, channel, (status) => {
      // A rejoin after a dropped socket fires SUBSCRIBED again; whatever was
      // sent in the gap is not replayed, so re-read the room.
      if (status !== 'SUBSCRIBED') return;
      if (joined) router.refresh();
      joined = true;
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      stop();
    };
  }, [roomId, router]);

  // Follow the conversation to its newest message, but not when older ones are
  // loaded in above it.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastId]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    setUploadingPhoto(true);
    const preview = URL.createObjectURL(file);
    try {
      // Private storage (G2): the upload returns a path in the sender's own
      // folder, and every viewer is handed a short-lived signed URL.
      const ref = await uploadImage({ file, bucket: 'media-private', pathPrefix: 'room' });
      // Optimistic: show the local copy immediately; the realtime echo
      // reconciles by sender+body, same as text messages.
      const optimistic: RoomMessage = {
        id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
        sender_id: currentUserId,
        body: PHOTO_BODY,
        image_url: ref,
        image_src: preview,
        created_at: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimistic]);
      const result = await sendPhotoMessage(roomId, ref);
      if (!result.ok) {
        setMessages((current) => current.filter((m) => m.id !== optimistic.id));
        toast.error(result.error ?? 'Could not send the photo.', result.code);
      } else {
        router.refresh(); // pick up the filed Photos-tab item
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not send the photo.',
        err instanceof UploadError ? err.code : undefined,
      );
    } finally {
      setUploadingPhoto(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    // Optimistic append. The Realtime INSERT handler above reconciles this
    // placeholder with the real row when it arrives (matching on sender+body),
    // so the sender never sees their own message twice.
    const optimistic: RoomMessage = {
      id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
      sender_id: currentUserId,
      body,
      image_url: null,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setSending((count) => count + 1);
    startTransition(async () => {
      // On failure the placeholder goes and the text goes back in the box —
      // and the reader is told why, so a vanished message isn't a mystery.
      const unsend = () => {
        setMessages((current) => current.filter((m) => m.id !== optimistic.id));
        setDraft(body);
      };
      try {
        const result = await sendMessage(roomId, body);
        if (!result.ok) {
          unsend();
          toast.error(result.error ?? 'Your message didn’t send. Try again.', result.code);
          if (!result.code) router.refresh(); // a block may have closed the room
          return;
        }
        router.refresh(); // pick up any auto-filed items
      } catch {
        unsend();
        toast.error('Your message didn’t send. Check your connection and try again.');
      } finally {
        setSending((count) => count - 1);
      }
    });
  }

  function loadEarlier() {
    const oldest = messages.find((m) => !m.id.startsWith(OPTIMISTIC_PREFIX));
    if (!oldest) return;
    setLoadingEarlier(true);
    loadEarlierMessages(roomId, oldest.created_at)
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error ?? 'Could not load earlier messages.', result.code);
          return;
        }
        setMoreBefore(result.hasMore);
        setMessages((current) => prependEarlierMessages(current, result.messages));
      })
      .catch(() => toast.error('Could not load earlier messages. Check your connection.'))
      .finally(() => setLoadingEarlier(false));
  }

  async function removeMessage(message: RoomMessage) {
    setMenu(null);
    const ok = await confirm({
      title: 'Delete this message?',
      body: 'It’s removed for everyone in this room. If it was a photo, the photo comes out of the Photos tab too. Anything else it filed into the tabs, like a place, task, or link, stays there.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteMessage(message.id, roomId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not delete that message.', result.code);
        return;
      }
      setMessages((current) => current.filter((m) => m.id !== message.id));
      router.refresh();
    });
  }

  // Reports this one message, not just its sender: the moderator sees the
  // words (and photo) themselves, even if they are deleted later.
  async function reportMessage(message: RoomMessage) {
    setMenu(null);
    const reason = await askReason({
      title: `Report this message from ${nameOf(message.sender_id)}?`,
      body: `A moderator sees the message and your reason, and a sentence is plenty. ${nameOf(message.sender_id)} won’t be told who reported it.`,
      confirmLabel: 'Send report',
    });
    if (!reason) return;
    startTransition(async () => {
      const result = await reportRoomMessage(message.id, reason);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send the report.', result.code);
        return;
      }
      toast.success('Report received.');
    });
  }

  async function blockSender(senderId: string) {
    setMenu(null);
    const name = memberNames[senderId];
    const ok = await confirm({
      title: `Block ${name ?? 'this person'}?`,
      body:
        roomKind === 'event'
          ? 'You’ll stop being connected, and they won’t find you in discovery or on the map or be able to reconnect. You stay in this plan’s room, but you won’t be notified about each other’s messages. They won’t be told.'
          : 'You’ll stop being connected, and they won’t find you in discovery or on the map or be able to reconnect. This conversation becomes read-only for both of you. They won’t be told.',
      confirmLabel: 'Block',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await blockProfile(senderId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not block that person.', result.code);
        return;
      }
      toast.success(`${name ?? 'They'} ${name ? 'is' : 'are'} blocked.`);
      router.refresh();
    });
  }

  const itemCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1;
    return acc;
  }, {});

  const visibleItems = items.filter((item) =>
    tab === 'chat' || tab === 'split'
      ? false
      : item.kind === tab || (tab === 'note' && item.kind === 'event'),
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-180px)]">
      <RoomHeader
        roomId={roomId}
        roomKind={roomKind}
        currentUserId={currentUserId}
        members={members}
        muted={muted}
        plan={plan}
        canLeave={canLeave}
        readOnly={readOnly}
      />

      <div
        role="tablist"
        aria-label="Room sections"
        className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 [scrollbar-width:none]"
      >
        {TABS.map((tabDef) => {
          const count =
            tabDef.key === 'chat'
              ? 0
              : tabDef.key === 'split'
                ? expenses.length
                : (itemCounts[tabDef.key] ?? 0);
          const active = tab === tabDef.key;
          return (
            <button
              key={tabDef.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tabDef.key)}
              className={`shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                active ? 'bg-ink text-paper' : 'bg-cream text-ink-soft hover:bg-line'
              }`}
            >
              <Glyph emoji={tabDef.emoji} size={14} className="mr-1 inline align-text-bottom" />
              {tabDef.label}
              {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto space-y-3 py-3">
            {moreBefore && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={loadingEarlier}
                  onClick={loadEarlier}
                >
                  {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
                </Button>
              </div>
            )}
            {messages.length === 0 && (
              <EmptyState
                emoji="👋"
                title="Say hello"
                body="Anything useful you share - addresses, links, to-dos - files itself into the tabs above."
              />
            )}
            {messages.map((message) => {
              const mine = message.sender_id === currentUserId;
              const present = memberIds.has(message.sender_id);
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  mine={mine}
                  senderName={nameOf(message.sender_id)}
                  menuOpen={menu === message.id}
                  onToggleMenu={() => setMenu((prev) => (prev === message.id ? null : message.id))}
                  pending={pending}
                  onReport={
                    !mine && !message.id.startsWith(OPTIMISTIC_PREFIX)
                      ? () => reportMessage(message)
                      : undefined
                  }
                  onBlock={!mine && present ? () => blockSender(message.sender_id) : undefined}
                  onDelete={
                    mine && !message.id.startsWith(OPTIMISTIC_PREFIX)
                      ? () => removeMessage(message)
                      : undefined
                  }
                />
              );
            })}
            <div ref={bottomRef} />
          </div>

          {sending > 0 && (
            <p role="status" className="pt-1 text-right text-xs text-ink-faint">
              Sending…
            </p>
          )}
          {canWrite && (
            <form onSubmit={submit} className="flex gap-2 pt-2 border-t border-line">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={onPickPhoto}
                className="hidden"
                aria-hidden
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                aria-label="Send a photo"
                className="shrink-0 rounded-pill border border-line bg-card px-3 py-2.5 text-lg leading-none outline-none hover:border-terracotta focus-visible:ring-2 focus-visible:ring-terracotta disabled:opacity-50"
              >
                {uploadingPhoto ? '…' : <Glyph emoji="📷" size={20} />}
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message…"
                aria-label="Message"
                maxLength={4000}
                className="flex-1 rounded-pill border border-line bg-card px-4 py-2.5 text-[15px] outline-none focus:border-terracotta"
              />
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                Send
              </Button>
            </form>
          )}
        </>
      ) : tab === 'split' ? (
        <SplitTab
          roomId={roomId}
          currentUserId={currentUserId}
          members={members}
          names={memberNames}
          expenses={expenses}
          shares={shares}
          readOnly={!canWrite}
        />
      ) : (
        <div className="flex-1 overflow-y-auto py-3 space-y-2">
          {tab === 'note' && !smartFiling && (
            // G32: say why notes are quiet, in the reader's terms (D25's rule:
            // never a word about keys or configuration).
            <p className="rounded-card bg-cream px-3.5 py-2.5 text-xs leading-snug text-ink-soft">
              Smart filing isn’t available right now, so only links, street addresses and
              to-dos (“I’ll bring…”, “don’t forget…”) file themselves. Everything else stays in
              the chat.
            </p>
          )}
          {visibleItems.length === 0 ? (
            <EmptyState
              emoji={TABS.find((t) => t.key === tab)?.emoji ?? '📋'}
              title={tab === 'photo' ? 'No photos yet' : 'Nothing filed yet'}
              body={
                tab === 'photo'
                  ? 'Tap the camera in the chat to share a photo. Everything shared shows up here.'
                  : tab === 'note' && !smartFiling
                    ? 'Notes are filed here when smart filing is on.'
                    : 'When someone shares something useful in chat, it lands here automatically.'
              }
            />
          ) : tab === 'photo' ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleItems.map((item) =>
                item.url ? (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-card border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.title}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ) : null,
              )}
            </div>
          ) : (
            visibleItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-card bg-card border border-line px-3.5 py-3"
              >
                {item.kind === 'task' && (
                  <input
                    type="checkbox"
                    checked={item.done}
                    aria-label={`Mark "${item.title}" ${item.done ? 'not done' : 'done'}`}
                    onChange={() =>
                      startTransition(async () => {
                        try {
                          const result = await toggleTask(item.id, roomId, !item.done);
                          if (!result.ok) {
                            toast.error(
                              result.error ?? 'Could not update the task. Try again.',
                              result.code,
                            );
                            return;
                          }
                          router.refresh();
                        } catch {
                          toast.error('Could not update the task. Try again.');
                        }
                      })
                    }
                    disabled={pending || !canWrite}
                    className="mt-1 size-4 accent-terracotta"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`font-medium text-terracotta-deep underline underline-offset-2 break-words`}
                    >
                      {item.title}
                    </a>
                  ) : (
                    <p
                      className={`font-medium ${item.done ? 'line-through text-ink-faint' : ''}`}
                    >
                      {item.kind === 'address' && <Glyph emoji="📍" size={14} className="mr-1 inline align-text-bottom" />}
                      {item.title}
                    </p>
                  )}
                  {item.detail && (
                    <p className="text-sm text-ink-soft mt-0.5 break-words">{item.detail}</p>
                  )}
                  <p className="text-[11px] text-ink-faint mt-1">
                    filed {formatRelative(item.created_at)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
