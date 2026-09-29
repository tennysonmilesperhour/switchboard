'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { downToConnect, withdrawIntent } from '@/lib/actions/mutual';
import { endRitual, pauseRitual, proposeRitual } from '@/lib/actions/rituals';
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

export interface RitualRow {
  id: string;
  activity: string;
  cadenceDays: number;
  status: string;
  isMine: boolean;
  otherId: string;
  otherName: string;
}

export function MutualClient({
  currentUserId,
  friends,
  intents,
  matches,
  rituals = [],
  initialPersonId = null,
}: {
  currentUserId: string;
  friends: MutualFriend[];
  intents: MyIntent[];
  matches: MyMatch[];
  rituals?: RitualRow[];
  initialPersonId?: string | null;
}) {
  const [activities, setActivities] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>(
    initialPersonId && friends.some((f) => f.id === initialPersonId)
      ? [initialPersonId]
      : [],
  );
  const [ritualPartner, setRitualPartner] = useState('');
  const [ritualActivity, setRitualActivity] = useState('Coffee');
  const [ritualCadence, setRitualCadence] = useState(21);
  const [justMatched, setJustMatched] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  // Realtime: when the OTHER person matches you, the DB trigger flips YOUR
  // intent to 'matched'. Listen for that and refresh so a match appears live,
  // without exposing anyone's unrequited interest (we only watch our own rows).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`mutual-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mutual_intents',
          filter: `author_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (payload.new.status === 'matched') {
            router.refresh();
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, router]);

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
          if (!result.ok) {
            toast.error(result.error ?? 'Could not save that quietly. Try again.', result.code);
            return;
          }
          if (result.matched) anyMatch = true;
        }
      }
      setActivities([]);
      setPeople([]);
      setJustMatched(anyMatch);
      router.refresh();
    });
  }

  async function end(ritual: RitualRow) {
    const ok = await confirm({
      title: `End your ${ritual.activity} ritual?`,
      body: `This stops the nudges between you and ${ritual.otherName}. You can always start a new one.`,
      confirmLabel: 'End ritual',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        const result = await endRitual(ritual.id);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not end the ritual. Try again.', result.code);
          return;
        }
        router.refresh();
      } catch {
        toast.error('Could not end the ritual. Try again.');
      }
    });
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-ink-soft leading-relaxed -mt-1">
        Pick an activity and the people you’d enjoy it with. Nothing is sent -
        if they independently pick you too, you <strong>both</strong> find out.
        If not, no one ever knows. 🤫
      </p>

      {justMatched && (
        <Card tone="sage" lifted className="animate-rise">
          <p className="font-display text-xl text-sage-deep">✨ It’s mutual!</p>
          <p className="text-sm text-ink-soft mt-1">
            You matched - check your matches below and say hi.
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
            body="Mutual is a private, two-sided signal: pick a friend and something you would enjoy doing together, and neither of you hears a word unless you both pick the same one. Add a connection first, then come back when there is someone to choose."
            action={
              <Link
                href="/people"
                className="inline-flex min-h-11 items-center rounded-btn bg-brand-gradient px-4 text-sm font-bold text-white"
              >
                Find your people
              </Link>
            }
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
                  className={`w-full flex items-center gap-3 rounded-card border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                    selected
                      ? 'border-terracotta bg-terracotta-soft'
                      : 'border-line bg-card hover:border-ink-faint'
                  }`}
                >
                  <Avatar name={friend.name} seed={friend.id} size="sm" />
                  <span className="flex-1 text-left font-bold">{friend.name}</span>
                  <Icon
                    name={selected ? 'check' : 'add'}
                    size={20}
                    className={selected ? 'text-terracotta-deep' : 'text-ink-faint'}
                  />
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
      {(activities.length === 0 || people.length === 0) && (
        <p className="text-xs text-ink-faint text-center">
          {activities.length === 0
            ? "Select an activity"
            : "Select someone to connect with"}
        </p>
      )}

      {/* Standing rituals */}
      <section>
        <SectionHeader
          title="Standing rituals 🔁"
          hint="Regular things with regular people, without the scheduling chore"
        />
        {rituals.length > 0 && (
          <ul className="space-y-2 mb-4">
            {rituals.map((ritual) => (
              <li
                key={ritual.id}
                className="flex items-center gap-3 rounded-card bg-cream px-3.5 py-2.5"
              >
                <span className="text-sm flex-1">
                  <strong>{ritual.activity}</strong> with{' '}
                  <strong>{ritual.otherName}</strong>
                  <span className="text-ink-faint">
                    {' '}
                    · every {ritual.cadenceDays} days
                    {ritual.status === 'proposed'
                      ? ritual.isMine
                        ? ' · waiting on them'
                        : ' · waiting on you (see Home)'
                      : ritual.status === 'paused'
                        ? ' · paused'
                        : ''}
                  </span>
                </span>
                {ritual.status !== 'proposed' && (
                  <button
                    type="button"
                    className="rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const result = await pauseRitual(ritual.id, ritual.status === 'active');
                          if (!result.ok) {
                            toast.error(result.error ?? 'Could not update the ritual. Try again.', result.code);
                            return;
                          }
                          router.refresh();
                        } catch {
                          toast.error('Could not update the ritual. Try again.');
                        }
                      })
                    }
                  >
                    {ritual.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  disabled={pending}
                  onClick={() => end(ritual)}
                >
                  End
                </button>
              </li>
            ))}
          </ul>
        )}
        {friends.length > 0 && (
          <Card>
            <p className="text-sm font-bold mb-2.5">Start one</p>
            <div className="space-y-2.5">
              <select
                value={ritualPartner}
                onChange={(e) => setRitualPartner(e.target.value)}
                aria-label="Ritual partner"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              >
                <option value="">With who?</option>
                {friends.map((friend) => (
                  <option key={friend.id} value={friend.id}>
                    {friend.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <select
                  value={ritualActivity}
                  onChange={(e) => setRitualActivity(e.target.value)}
                  aria-label="Ritual activity"
                  className="flex-1 rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                >
                  {ACTIVITY_PRESETS.map((activity) => (
                    <option key={activity.label} value={activity.label}>
                      {activity.emoji} {activity.label}
                    </option>
                  ))}
                </select>
                <select
                  value={ritualCadence}
                  onChange={(e) => setRitualCadence(Number(e.target.value))}
                  aria-label="Ritual cadence"
                  className="rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                >
                  <option value={7}>Weekly</option>
                  <option value={14}>Every 2 weeks</option>
                  <option value={21}>Every 3 weeks</option>
                  <option value={30}>Monthly</option>
                  <option value={60}>Every 2 months</option>
                </select>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={pending || !ritualPartner}
                onClick={() =>
                  startTransition(async () => {
                    const result = await proposeRitual(
                      ritualPartner,
                      ritualActivity,
                      ritualCadence,
                    );
                    if (!result.ok) {
                      toast.error(result.error ?? 'Could not propose the ritual.', result.code);
                      return;
                    }
                    setRitualPartner('');
                    router.refresh();
                    toast.success('Ritual proposed.');
                  })
                }
              >
                Propose the ritual
              </Button>
              <p className="text-xs text-ink-faint">
                They accept once. After that, Switchboard nudges you both when
                it has been about that long, and either of you can skip
                guilt-free.
              </p>
            </div>
          </Card>
        )}
      </section>

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
                  className="rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await withdrawIntent(intent.id);
                      if (!result.ok) {
                        toast.error(result.error ?? 'Could not withdraw. Try again.', result.code);
                        return;
                      }
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
