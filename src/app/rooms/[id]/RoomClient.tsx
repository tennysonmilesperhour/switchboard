'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { sendMessage, toggleTask } from '@/lib/actions/rooms';
import { formatRelative } from '@/lib/format';
import type { RoomItemKind } from '@/lib/types';

export interface RoomMessage {
  id: string;
  sender_id: string;
  body: string;
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

const TABS: Array<{ key: 'chat' | RoomItemKind; label: string; emoji: string }> = [
  { key: 'chat', label: 'Chat', emoji: '💬' },
  { key: 'address', label: 'Places', emoji: '📍' },
  { key: 'task', label: 'Tasks', emoji: '✓' },
  { key: 'link', label: 'Links', emoji: '🔗' },
  { key: 'note', label: 'Notes', emoji: '📝' },
];

interface RoomClientProps {
  roomId: string;
  currentUserId: string;
  memberNames: Record<string, string>;
  initialMessages: RoomMessage[];
  items: RoomItemRow[];
}

export function RoomClient({
  roomId,
  currentUserId,
  memberNames,
  initialMessages,
  items,
}: RoomClientProps) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [tab, setTab] = useState<'chat' | RoomItemKind>('chat');
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
          setMessages((current) =>
            current.some((m) => m.id === incoming.id)
              ? current
              : [...current, incoming],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    // Optimistic append (Realtime will de-dupe by id).
    const optimistic: RoomMessage = {
      id: `optimistic-${Date.now()}`,
      sender_id: currentUserId,
      body,
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
    tab === 'chat' ? false : item.kind === tab || (tab === 'note' && item.kind === 'event'),
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-180px)]">
      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Room sections"
        className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 [scrollbar-width:none]"
      >
        {TABS.map((tabDef) => {
          const count = tabDef.key === 'chat' ? 0 : (itemCounts[tabDef.key] ?? 0);
          const active = tab === tabDef.key;
          return (
            <button
              key={tabDef.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tabDef.key)}
              className={`shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-medium transition-colors ${
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
                    <Avatar
                      name={memberNames[message.sender_id] ?? '?'}
                      seed={message.sender_id}
                      size="sm"
                    />
                  )}
                  <div className={`max-w-[75%] ${mine ? 'items-end' : ''}`}>
                    {!mine && (
                      <p className="text-[11px] text-ink-faint mb-0.5 px-1">
                        {memberNames[message.sender_id] ?? 'Member'}
                      </p>
                    )}
                    <div
                      className={`rounded-card px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                        mine
                          ? 'bg-terracotta text-white rounded-br-md'
                          : 'bg-cream text-ink rounded-bl-md'
                      }`}
                    >
                      {message.body}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={submit} className="flex gap-2 pt-2 border-t border-line">
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
      ) : (
        <div className="flex-1 overflow-y-auto py-3 space-y-2">
          {visibleItems.length === 0 ? (
            <EmptyState
              emoji={TABS.find((t) => t.key === tab)?.emoji ?? '❋'}
              title="Nothing filed yet"
              body="When someone shares something useful in chat, it lands here automatically."
            />
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
                        await toggleTask(item.id, roomId, !item.done);
                        router.refresh();
                      })
                    }
                    disabled={pending}
                    className="mt-1 size-4 accent-[oklch(56%_0.09_152)]"
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
