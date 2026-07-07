'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { postAnnouncement } from '@/lib/actions/announcements';
import { formatRelative } from '@/lib/format';

export interface AnnouncementView {
  id: string;
  body: string;
  created_at: string;
  author_name: string;
}

interface AnnouncementsProps {
  eventId: string;
  isHost: boolean;
  canReach: number;
  announcements: AnnouncementView[];
}

/** Host broadcasts ("text blast", the calm version) plus the running log. */
export function Announcements({
  eventId,
  isHost,
  canReach,
  announcements,
}: AnnouncementsProps) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!isHost && announcements.length === 0) return null;

  function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError('');
    startTransition(async () => {
      const result = await postAnnouncement(eventId, trimmed);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong');
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  return (
    <section>
      <SectionHeader
        title="Announcements"
        hint={isHost ? 'Everyone who’s in gets it' : undefined}
      />
      {isHost && (
        <Card className="mb-3">
          <label htmlFor="announcement" className="sr-only">
            Message to everyone who’s in
          </label>
          <textarea
            id="announcement"
            value={body}
            rows={2}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Door code is 4321 · running 10 late · bring a jacket…"
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft resize-none"
          />
          {error && <p role="alert" className="text-sm text-rose-deep mt-1.5">{error}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-faint">
              {canReach > 0
                ? `Reaches ${canReach} ${canReach === 1 ? 'person' : 'people'} who’s in`
                : 'No one has accepted yet'}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={pending || body.trim().length === 0}
              onClick={send}
            >
              {pending ? 'Sending…' : 'Send to everyone'}
            </Button>
          </div>
        </Card>
      )}
      {announcements.length > 0 && (
        <ul className="space-y-2">
          {announcements.map((item) => (
            <li key={item.id} className="rounded-card bg-cream px-3.5 py-3">
              <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
                📣 {item.body}
              </p>
              <p className="text-xs text-ink-faint mt-1.5">
                {item.author_name} · {formatRelative(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
