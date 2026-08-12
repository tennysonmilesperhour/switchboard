'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  markRoomRead,
  sendMessage,
  sendPhotoMessage,
  toggleTask,
} from '@/lib/actions/rooms';
import { blockProfile, reportProfile } from '@/lib/actions/connections';
import { addExpense, deleteExpense } from '@/lib/actions/expenses';
import { uploadImage } from '@/lib/client/upload-image';
import { formatRelative } from '@/lib/format';
import type { RoomItemKind } from '@/lib/types';

export interface RoomMessage {
  id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
}

export interface RoomItemRow {
  id: string;
  kind: RoomItemKind;
  title: string;
  detail: string | null;
  url: string | null;
  done: boolean;
  created_at: string;
}

export interface ExpenseRow {
  id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  settle_url: string | null;
  created_by: string;
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

interface RoomClientProps {
  roomId: string;
  currentUserId: string;
  memberNames: Record<string, string>;
  initialMessages: RoomMessage[];
  items: RoomItemRow[];
  expenses: ExpenseRow[];
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function RoomClient({
  roomId,
  currentUserId,
  memberNames,
  initialMessages,
  items,
  expenses,
}: RoomClientProps) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [tab, setTab] = useState<TabKey>('chat');
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  // Split the Bill form state.
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseUrl, setExpenseUrl] = useState('');
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [memberMenu, setMemberMenu] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    markRoomRead(roomId).catch(() => undefined);
    const interval = setInterval(() => {
      markRoomRead(roomId).catch(() => undefined);
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        markRoomRead(roomId).catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [roomId]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await uploadImage({ file, bucket: 'media', pathPrefix: 'room' });
      // Optimistic: show it immediately; the realtime echo reconciles by
      // sender+body, same as text messages.
      const optimistic: RoomMessage = {
        id: `optimistic-${Date.now()}`,
        sender_id: currentUserId,
        body: '📷 Photo',
        image_url: url,
        created_at: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimistic]);
      const result = await sendPhotoMessage(roomId, url);
      if (!result.ok) {
        setMessages((current) => current.filter((m) => m.id !== optimistic.id));
        toast.error(result.error ?? 'Could not send the photo.', result.code);
      } else {
        router.refresh(); // pick up the filed Photos-tab item
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removeExpense(expenseId: string) {
    const ok = await confirm({
      title: 'Delete this expense?',
      body: 'It’ll be removed from the ledger for everyone in this room.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteExpense(expenseId, roomId);
        router.refresh();
      } catch {
        toast.error('Could not delete the expense. Try again.');
      }
    });
  }

  // Live messages via Supabase Realtime.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const incoming = payload.new as RoomMessage;
          setMessages((current) => {
            // Already have the real row (e.g. duplicate delivery) — ignore.
            if (current.some((m) => m.id === incoming.id)) return current;
            // Reconcile our own optimistic placeholder: it was appended with a
            // synthetic `optimistic-…` id, so it won't match the real UUID here.
            // Swap the first matching placeholder for the real row instead of
            // appending a second copy (which showed the sender their own
            // message twice).
            const placeholder = current.findIndex(
              (m) =>
                m.id.startsWith('optimistic-') &&
                m.sender_id === incoming.sender_id &&
                m.body === incoming.body,
            );
            if (placeholder === -1) return [...current, incoming];
            const next = [...current];
            next[placeholder] = incoming;
            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        {
          // Auto-filed items (addresses/tasks/links/notes) land in room_items;
          // refresh so a member sees another member's filing appear live.
          event: 'INSERT',
          schema: 'public',
          table: 'room_items',
          filter: `room_id=eq.${roomId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    // Optimistic append. The Realtime INSERT handler above reconciles this
    // placeholder with the real row when it arrives (matching on sender+body),
    // so the sender never sees their own message twice.
    const optimistic: RoomMessage = {
      id: `optimistic-${Date.now()}`,
      sender_id: currentUserId,
      body,
      image_url: null,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    startTransition(async () => {
      const result = await sendMessage(roomId, body);
      if (!result.ok) {
        setMessages((current) => current.filter((m) => m.id !== optimistic.id));
        setDraft(body);
      } else {
        router.refresh(); // pick up any auto-filed items
      }
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

  // Split the Bill: equal shares across everyone in the room.
  const memberIds = Object.keys(memberNames);
  const memberCount = Math.max(memberIds.length, 1);
  const totalCents = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const shareCents = Math.round(totalCents / memberCount);
  const paidByMember = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.payer_id] = (acc[e.payer_id] ?? 0) + e.amount_cents;
    return acc;
  }, {});
  const myPaid = paidByMember[currentUserId] ?? 0;
  const myNet = myPaid - shareCents; // positive: you're owed; negative: you owe

  function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    const description = expenseDesc.trim();
    const amount = expenseAmount.trim();
    if (!description || !amount) return;
    setExpenseError(null);
    startTransition(async () => {
      const result = await addExpense(roomId, description, amount, expenseUrl.trim());
      if (result.ok) {
        setExpenseDesc('');
        setExpenseAmount('');
        setExpenseUrl('');
        router.refresh();
      } else {
        setExpenseError(result.error ?? 'Could not add that.');
      }
    });
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-180px)]">
      {/* Tabs */}
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
              {tabDef.emoji} {tabDef.label}
              {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto space-y-3 py-3">
            {messages.length === 0 && (
              <EmptyState
                emoji="👋"
                title="Say hello"
                body="Anything useful you share - addresses, links, to-dos - files itself into the tabs above."
              />
            )}
            {messages.map((message) => {
              const mine = message.sender_id === currentUserId;
              return (
                <div
                  key={message.id}
                  className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}
                >
                  {!mine && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setMemberMenu((prev) =>
                            prev === message.sender_id ? null : message.sender_id,
                          )
                        }
                        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        <Avatar
                          name={memberNames[message.sender_id] ?? '?'}
                          seed={message.sender_id}
                          size="sm"
                        />
                      </button>
                      {memberMenu === message.sender_id && (
                        <div className="absolute left-0 top-full z-30 mt-1 min-w-[120px] rounded-card border border-line bg-card p-1 shadow-float">
                          <button
                            type="button"
                            disabled={pending}
                            className="w-full rounded-btn px-3 py-1.5 text-left text-xs font-semibold text-ink-faint hover:bg-cream"
                            onClick={async () => {
                              setMemberMenu(null);
                              const reason = window.prompt(
                                `Briefly describe why you are reporting ${memberNames[message.sender_id] ?? 'this person'}.`,
                              );
                              if (!reason) return;
                              startTransition(async () => {
                                const result = await reportProfile(message.sender_id, reason);
                                if (!result.ok)
                                  return toast.error(
                                    result.error ?? 'Could not send the report.',
                                    result.code,
                                  );
                                toast.success('Report received.');
                              });
                            }}
                          >
                            Report
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            className="w-full rounded-btn px-3 py-1.5 text-left text-xs font-semibold text-rose-deep hover:bg-cream"
                            onClick={async () => {
                              setMemberMenu(null);
                              const ok = await confirm({
                                title: `Block ${memberNames[message.sender_id] ?? 'this person'}?`,
                                body: 'They will be removed and will not be able to reconnect with you.',
                                confirmLabel: 'Block',
                                danger: true,
                              });
                              if (!ok) return;
                              startTransition(async () => {
                                const result = await blockProfile(message.sender_id);
                                if (!result.ok)
                                  return toast.error(
                                    result.error ?? 'Could not block that person.',
                                    result.code,
                                  );
                                router.refresh();
                              });
                            }}
                          >
                            Block
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`max-w-[75%] ${mine ? 'items-end' : ''}`}>
                    {!mine && (
                      <p className="text-[11px] text-ink-faint mb-0.5 px-1">
                        {memberNames[message.sender_id] ?? 'Member'}
                      </p>
                    )}
                    {message.image_url ? (
                      <div
                        className={`overflow-hidden rounded-card ${
                          mine ? 'rounded-br-md' : 'rounded-bl-md'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={message.image_url}
                          alt={message.body === '📷 Photo' ? 'Shared photo' : message.body}
                          className="max-h-72 w-full object-cover"
                          loading="lazy"
                        />
                        {message.body !== '📷 Photo' && (
                          <p
                            className={`px-3.5 py-2 text-[15px] leading-relaxed break-words ${
                              mine ? 'bg-terracotta text-white' : 'bg-cream text-ink'
                            }`}
                          >
                            {message.body}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div
                        className={`rounded-card px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                          mine
                            ? 'bg-terracotta text-white rounded-br-md'
                            : 'bg-cream text-ink rounded-bl-md'
                        }`}
                      >
                        {message.body}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

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
              {uploadingPhoto ? '…' : '📷'}
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message…"
              aria-label="Message"
              className="flex-1 rounded-pill border border-line bg-card px-4 py-2.5 text-[15px] outline-none focus:border-terracotta"
            />
            <Button type="submit" size="sm" disabled={!draft.trim()}>
              Send
            </Button>
          </form>
        </>
      ) : tab === 'split' ? (
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {expenses.length > 0 && (
            <div className="rounded-card bg-cream px-3.5 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">Total spent</span>
                <span className="font-medium">{formatMoney(totalCents)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-ink-soft">Even split ({memberCount})</span>
                <span className="font-medium">{formatMoney(shareCents)} each</span>
              </div>
              <p className="text-sm mt-2 pt-2 border-t border-line">
                {myNet > 0 ? (
                  <>You’re owed <strong>{formatMoney(myNet)}</strong>.</>
                ) : myNet < 0 ? (
                  <>You owe <strong>{formatMoney(-myNet)}</strong>.</>
                ) : (
                  <>You’re all square.</>
                )}
              </p>
            </div>
          )}

          {expenses.length === 0 ? (
            <EmptyState
              emoji="💸"
              title="No expenses yet"
              body="Log what people paid - Switchboard tallies who owes what. Settling up happens with your own Venmo or PayPal link."
            />
          ) : (
            <ul className="space-y-2">
              {expenses.map((expense) => {
                const canRemove =
                  expense.created_by === currentUserId ||
                  expense.payer_id === currentUserId;
                return (
                  <li
                    key={expense.id}
                    className="flex items-start gap-3 rounded-card bg-card border border-line px-3.5 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium break-words">{expense.description}</p>
                      <p className="text-xs text-ink-faint mt-0.5">
                        {memberNames[expense.payer_id] ?? 'Someone'} paid ·{' '}
                        {formatRelative(expense.created_at)}
                      </p>
                      {expense.settle_url && (
                        <a
                          href={expense.settle_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-terracotta-deep underline underline-offset-2 mt-1 inline-block"
                        >
                          Settle up →
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-medium">{formatMoney(expense.amount_cents)}</span>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => removeExpense(expense.id)}
                          disabled={pending}
                          className="rounded-pill px-2 py-1 text-[11px] text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                        >
                          remove
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            onSubmit={submitExpense}
            className="space-y-2 pt-2 border-t border-line"
          >
            <input
              value={expenseDesc}
              onChange={(e) => setExpenseDesc(e.target.value)}
              placeholder="What was it for?"
              aria-label="Expense description"
              maxLength={120}
              className="w-full rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            <div className="flex gap-2">
              <input
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Amount"
                aria-label="Amount"
                className="w-28 rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <input
                value={expenseUrl}
                onChange={(e) => setExpenseUrl(e.target.value)}
                placeholder="Venmo/PayPal link (optional)"
                aria-label="Settle-up link"
                className="flex-1 rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
              />
            </div>
            {expenseError && (
              <p className="text-xs text-rose-deep">{expenseError}</p>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={pending || !expenseDesc.trim() || !expenseAmount.trim()}
            >
              Add expense
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-3 space-y-2">
          {visibleItems.length === 0 ? (
            <EmptyState
              emoji={TABS.find((t) => t.key === tab)?.emoji ?? '📋'}
              title={tab === 'photo' ? 'No photos yet' : 'Nothing filed yet'}
              body={
                tab === 'photo'
                  ? 'Tap 📷 in the chat to share a photo. Everything shared shows up here.'
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
                          await toggleTask(item.id, roomId, !item.done);
                          router.refresh();
                        } catch {
                          toast.error('Could not update the task. Try again.');
                        }
                      })
                    }
                    disabled={pending}
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
                      {item.kind === 'address' ? '📍 ' : ''}
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
