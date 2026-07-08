'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  acceptConnection,
  createCircle,
  removeConnection,
  sendConnectionRequest,
  toggleCircleMember,
} from '@/lib/actions/connections';
import { proposeIntroduction } from '@/lib/actions/matchmaker';
import { createHousehold, deleteHousehold } from '@/lib/actions/households';
import { ACTIVITY_PRESETS } from '@/lib/types';

export interface FriendRow {
  connectionId: string;
  id: string;
  name: string;
  handle: string;
  circleIds: string[];
}

export interface RequestRow {
  connectionId: string;
  id: string;
  name: string;
  handle: string;
}

export interface CircleRow {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
}

export interface HouseholdRow {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
}

export function PeopleClient({
  friends,
  incoming,
  outgoing,
  circles,
  households = [],
}: {
  friends: FriendRow[];
  incoming: RequestRow[];
  outgoing: RequestRow[];
  circles: CircleRow[];
  households?: HouseholdRow[];
}) {
  const [handle, setHandle] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [expandedFriend, setExpandedFriend] = useState<string | null>(null);
  const [newCircle, setNewCircle] = useState('');
  const [matchA, setMatchA] = useState('');
  const [matchB, setMatchB] = useState('');
  const [matchActivity, setMatchActivity] = useState('Coffee');
  const [matchNote, setMatchNote] = useState('');
  const [matchStatus, setMatchStatus] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [householdMembers, setHouseholdMembers] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  async function removeFriend(friend: FriendRow) {
    const ok = await confirm({
      title: `Remove ${friend.name}?`,
      body: 'You’ll disconnect from each other. You can always reconnect later by handle.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await removeConnection(friend.connectionId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove that connection.');
        return;
      }
      router.refresh();
    });
  }

  async function removeHousehold(household: HouseholdRow) {
    const ok = await confirm({
      title: `Delete ${household.name}?`,
      body: 'This removes the household group. The people in it stay your friends.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteHousehold(household.id);
        router.refresh();
      } catch {
        toast.error('Could not delete the household. Try again.');
      }
    });
  }

  function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    const value = handle;
    startTransition(async () => {
      const result = await sendConnectionRequest(value);
      setMessage(
        result.ok
          ? { tone: 'ok', text: 'Request sent 💌' }
          : { tone: 'error', text: result.error ?? 'Something went wrong' },
      );
      if (result.ok) setHandle('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {/* Add someone */}
      <section>
        <SectionHeader title="Add someone" hint="Ask a friend for their handle" />
        <form onSubmit={submitRequest} className="flex gap-2">
          <div className="flex items-center flex-1 rounded-pill border border-line bg-card focus-within:border-terracotta">
            <span className="pl-4 text-ink-faint">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="handle"
              aria-label="Friend's handle"
              className="flex-1 bg-transparent px-1.5 py-2.5 text-sm outline-none lowercase"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending || !handle.trim()}>
            Connect
          </Button>
        </form>
        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={`text-sm mt-2 ${message.tone === 'error' ? 'text-rose-deep' : 'text-sage-deep'}`}
          >
            {message.text}
          </p>
        )}
      </section>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <section>
          <SectionHeader title="Wants to connect" />
          <div className="space-y-2">
            {incoming.map((request) => (
              <Card key={request.connectionId} tone="gold">
                <div className="flex items-center gap-3">
                  <Avatar name={request.name} seed={request.id} size="sm" />
                  <span className="flex-1">
                    <span className="font-bold block">{request.name}</span>
                    <span className="text-xs text-ink-faint">@{request.handle}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="accept"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await acceptConnection(request.connectionId);
                        if (!result.ok) {
                          toast.error(result.error ?? 'Could not accept. Try again.');
                          return;
                        }
                        router.refresh();
                      })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await removeConnection(request.connectionId);
                        if (!result.ok) {
                          toast.error(result.error ?? 'Could not update. Try again.');
                          return;
                        }
                        router.refresh();
                      })
                    }
                  >
                    Ignore
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Friends */}
      {friends.length > 0 && (
        <section>
          <SectionHeader
            title={`Friends · ${friends.length}`}
            hint="Tap a friend to sort them into circles"
          />
          <div className="space-y-2">
            {friends.map((friend) => {
              const expanded = expandedFriend === friend.id;
              return (
                <Card key={friend.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    aria-expanded={expanded}
                    onClick={() => setExpandedFriend(expanded ? null : friend.id)}
                  >
                    <Avatar name={friend.name} seed={friend.id} size="sm" />
                    <span className="flex-1">
                      <span className="font-bold block">{friend.name}</span>
                      <span className="text-xs text-ink-faint">
                        @{friend.handle}
                        {friend.circleIds.length > 0 &&
                          ` · ${friend.circleIds
                            .map((id) => circles.find((c) => c.id === id)?.emoji ?? '')
                            .join(' ')}`}
                      </span>
                    </span>
                    <Icon
                      name="back"
                      size={18}
                      className={`text-ink-faint transition-transform ${expanded ? 'rotate-90' : '-rotate-90'}`}
                    />

                  </button>
                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-line animate-rise">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2.5">
                        Circles
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {circles.map((circle) => {
                          const inCircle = friend.circleIds.includes(circle.id);
                          return (
                            <Chip
                              key={circle.id}
                              emoji={circle.emoji}
                              selected={inCircle}
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  const result = await toggleCircleMember(
                                    circle.id,
                                    friend.id,
                                    !inCircle,
                                  );
                                  if (!result.ok) {
                                    toast.error(result.error ?? 'Could not update circle.');
                                    return;
                                  }
                                  router.refresh();
                                })
                              }
                            >
                              {circle.name}
                            </Chip>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeFriend(friend)}
                        className="inline-flex items-center gap-1 rounded-pill px-1 py-1 text-xs font-semibold text-ink-faint hover:text-rose-deep mt-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        <Icon name="close" size={14} />
                        Remove connection
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Outgoing */}
      {outgoing.length > 0 && (
        <section>
          <SectionHeader title="Waiting to hear back" />
          <ul className="space-y-1.5">
            {outgoing.map((request) => (
              <li
                key={request.connectionId}
                className="flex items-center gap-3 rounded-card bg-cream px-3.5 py-2.5 text-sm"
              >
                <span className="flex-1">
                  <strong>{request.name}</strong>{' '}
                  <span className="text-ink-faint">@{request.handle}</span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await removeConnection(request.connectionId);
                      if (!result.ok) {
                        toast.error(result.error ?? 'Could not cancel. Try again.');
                        return;
                      }
                      router.refresh();
                    })
                  }
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Friendly empty state */}
      {friends.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
        <EmptyState
          emoji="👋"
          title="Your people live here"
          body="Add a friend by their handle above. Once you're connected you can sort them into circles and quietly play matchmaker."
        />
      )}

      {/* Households */}
      {friends.length > 0 && (
        <section>
          <SectionHeader
            title="Households 🏡"
            hint="Invite a whole family or roommate crew with one tap"
          />
          {households.length > 0 && (
            <div className="space-y-2 mb-3">
              {households.map((household) => (
                <div
                  key={household.id}
                  className="flex items-center gap-3 rounded-card bg-cream px-3.5 py-3 text-sm"
                >
                  <span className="text-lg" aria-hidden>{household.emoji}</span>
                  <span className="font-bold flex-1">{household.name}</span>
                  <span className="text-xs text-ink-faint">
                    {household.memberCount} {household.memberCount === 1 ? 'person' : 'people'}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    onClick={() => removeHousehold(household)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <Card>
            <div className="space-y-2.5">
              <input
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="Household name (The Riveras, Lake House Crew…)"
                aria-label="Household name"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <div className="flex flex-wrap gap-2">
                {friends.map((friend) => {
                  const selected = householdMembers.includes(friend.id);
                  return (
                    <Chip
                      key={friend.id}
                      selected={selected}
                      onClick={() =>
                        setHouseholdMembers((current) =>
                          selected
                            ? current.filter((id) => id !== friend.id)
                            : [...current, friend.id],
                        )
                      }
                    >
                      {friend.name.split(' ')[0]}
                    </Chip>
                  );
                })}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={pending || !householdName.trim() || householdMembers.length === 0}
                onClick={() =>
                  startTransition(async () => {
                    const result = await createHousehold(householdName, householdMembers);
                    if (!result.ok) {
                      toast.error(result.error ?? 'Could not create the household.');
                      return;
                    }
                    setHouseholdName('');
                    setHouseholdMembers([]);
                    router.refresh();
                    toast.success('Household created.');
                  })
                }
              >
                Create household
              </Button>
            </div>
          </Card>
        </section>
      )}

      {/* Matchmaker */}
      {friends.length >= 2 && (
        <section>
          <SectionHeader
            title="Play matchmaker 🤝"
            hint="Introduce two friends. Revealed only if they both say yes."
          />
          <Card>
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <select
                  value={matchA}
                  onChange={(e) => setMatchA(e.target.value)}
                  aria-label="First friend"
                  className="flex-1 rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                >
                  <option value="">First friend</option>
                  {friends.map((friend) => (
                    <option key={friend.id} value={friend.id} disabled={friend.id === matchB}>
                      {friend.name}
                    </option>
                  ))}
                </select>
                <select
                  value={matchB}
                  onChange={(e) => setMatchB(e.target.value)}
                  aria-label="Second friend"
                  className="flex-1 rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
                >
                  <option value="">Second friend</option>
                  {friends.map((friend) => (
                    <option key={friend.id} value={friend.id} disabled={friend.id === matchA}>
                      {friend.name}
                    </option>
                  ))}
                </select>
              </div>
              <select
                value={matchActivity}
                onChange={(e) => setMatchActivity(e.target.value)}
                aria-label="Suggested activity"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              >
                {ACTIVITY_PRESETS.map((activity) => (
                  <option key={activity.label} value={activity.label}>
                    {activity.emoji} {activity.label}
                  </option>
                ))}
              </select>
              <input
                value={matchNote}
                onChange={(e) => setMatchNote(e.target.value)}
                maxLength={140}
                placeholder="Why they'd hit it off (they'll both see this)"
                aria-label="Matchmaker note"
                className="w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              {matchStatus && (
                <p className="text-xs text-sage-deep" role="status">{matchStatus}</p>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={pending || !matchA || !matchB}
                onClick={() =>
                  startTransition(async () => {
                    const result = await proposeIntroduction(
                      matchA,
                      matchB,
                      matchActivity,
                      matchNote,
                    );
                    if (result.ok) {
                      setMatchStatus('Introduction sent, quietly. 🤫');
                      setMatchA('');
                      setMatchB('');
                      setMatchNote('');
                    } else {
                      setMatchStatus(result.error ?? 'Something went wrong');
                    }
                    router.refresh();
                  })
                }
              >
                Suggest they meet
              </Button>
              <p className="text-xs text-ink-faint">
                Neither friend learns who the other is unless both are curious.
                A no is invisible to everyone, including you.
              </p>
            </div>
          </Card>
        </section>
      )}

      {/* Circles */}
      <section>
        <SectionHeader title="Your circles" hint="Reused everywhere you choose an audience" />
        <div className="space-y-2">
          {circles.map((circle) => (
            <div
              key={circle.id}
              className="flex items-center gap-3 rounded-card bg-cream px-3.5 py-3 text-sm"
            >
              <span className="text-lg" aria-hidden>{circle.emoji}</span>
              <span className="font-bold flex-1">{circle.name}</span>
              <span className="text-xs text-ink-faint">
                {circle.memberCount} {circle.memberCount === 1 ? 'person' : 'people'}
              </span>
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newCircle;
            startTransition(async () => {
              const result = await createCircle(name, '✨');
              if (!result.ok) {
                toast.error(result.error ?? 'Could not create the circle.');
                return;
              }
              setNewCircle('');
              router.refresh();
            });
          }}
        >
          <input
            value={newCircle}
            onChange={(e) => setNewCircle(e.target.value)}
            placeholder="New circle (e.g. Book Club)"
            aria-label="New circle name"
            className="flex-1 rounded-pill border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-terracotta"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending || !newCircle.trim()}>
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}
