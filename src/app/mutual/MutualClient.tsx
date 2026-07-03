'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { downToConnect, withdrawIntent } from '@/lib/actions/mutual';
import { formatRelative } from '@/lib/format';
import { ACTIVITY_PRESETS } from '@/lib/types';

export interface MutualFriend {
  id: string;
  name: string;
  handle: string;
}

export interface MyIntent {
  id: string;
  targetId: string;
  targetName: string;
  activity: string;
}

export interface MyMatch {
  id: string;
  otherId: string;
  otherName: string;
  activity: string;
  roomId: string | null;
  createdAt: string;
}

export function MutualClient({
  friends,
  intents,
  matches,
}: {
  friends: MutualFriend[];
  intents: MyIntent[];
  matches: MyMatch[];
}) {
  const [activities, setActivities] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [justMatched, setJustMatched] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
  }

  function connect() {
    startTransition(async () => {
      let anyMatch = false;
      for (const personId of people) {
        for (const activity of activities) {
          const result = await downToConnect(personId, activity);
          if (result.matched) anyMatch = true;
        }
      }
      setActivities([]);
      setPeople([]);
      setJustMatched(anyMatch);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-ink-soft leading-relaxed -mt-1">
        Pick an activity and the people you’d enjoy it with. Nothing is sent —
        if they independently pick you too, you <em>both</em> find out.
        If not, no one ever knows. 🤫
      </p>

      {justMatched && (
        <Card tone="sage" lifted className="animate-rise">
          <p className="font-display text-xl text-sage-deep">✨ It’s mutual!</p>
          <p className="text-sm text-ink-soft mt-1">
            You matched — check your matches below and say hi.
          </p>
        </Card>
      )}

      {/* New matches */}
      {matches.length > 0 && (
        <section>
          <SectionHeader title="Your matches" hint="You both chose each other" />
          <div className="space-y-2.5">
            {matches.map((match) => (
              <Card key={match.id} tone="sage" className="animate-rise">
                <div className="flex items-center gap-3">
                  <Avatar name={match.otherName} seed={match.otherId} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">
                      {match.otherName} <span className="text-ink-faint">·</span>{' '}
                      <span className="text-sage-deep">{match.activity}</span>
                    </p>
                    <p className="text-xs text-ink-faint">
                      matched {formatRelative(match.createdAt)}
                    </p>
                  </div>
                  {match.roomId && (
                    <Link href={`/rooms/${match.roomId}`}>
                      <Button size="sm">Say hi 💬</Button>
                    </Link>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Compose */}
      <section>
        <SectionHeader title="Down to…" />
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_PRESETS.map((activity) => (
            <Chip
              key={activity.label}
              emoji={activity.emoji}
              selected={activities.includes(activity.label)}
              onClick={() => setActivities((a) => toggle(a, activity.label))}
            >
              {activity.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="…with" />
        {friends.length === 0 ? (
          <EmptyState
            emoji="☺"
            title="No connections yet"
            body="Add friends from the People tab first — Mutual Mode needs someone to be mutual with."
          />
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => {
              const selected = people.includes(friend.id);
              return (
                <button
                  key={friend.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPeople((p) => toggle(p, friend.id))}
                  className={`w-full flex items-center gap-3 rounded-card border p-3 transition-all ${
                    selected
                      ? 'border-terracotta bg-terracotta-soft'
                      : 'border-line bg-card hover:border-ink-faint'
                  }`}
                >
                  <Avatar name={friend.name} seed={friend.id} size="sm" />
                  <span className="flex-1 text-left font-medium">{friend.name}</span>
                  <span aria-hidden className={selected ? 'text-terracotta-deep' : 'text-line'}>
                    {selected ? '✓' : '+'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <Button
        size="lg"
        className="w-full"
        disabled={pending || activities.length === 0 || people.length === 0}
        onClick={connect}
      >
        {pending ? 'Saving quietly…' : 'Down to Connect 🤝'}
      </Button>
      <p className="text-xs text-ink-faint text-center -mt-4">
        Completely private until it’s mutual.
      </p>

      {/* Active intents */}
      {intents.length > 0 && (
        <section>
          <SectionHeader
            title="Waiting quietly"
            hint="Only you can see these"
          />
          <ul className="space-y-2">
            {intents.map((intent) => (
              <li
                key={intent.id}
                className="flex items-center gap-3 rounded-card bg-cream px-3.5 py-2.5"
              >
                <span className="text-sm flex-1">
                  <strong>{intent.activity}</strong> with{' '}
                  <strong>{intent.targetName}</strong>
                </span>
                <button
                  type="button"
                  className="text-xs text-ink-faint hover:text-rose-deep"
                  onClick={() =>
                    startTransition(async () => {
                      await withdrawIntent(intent.id);
                      router.refresh();
                    })
                  }
                >
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
