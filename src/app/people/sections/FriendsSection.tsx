'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { CircleRow, FriendRow } from './types';

interface FriendsSectionProps {
  friends: FriendRow[];
  circles: CircleRow[];
  expandedFriend: string | null;
  setExpandedFriend: Dispatch<SetStateAction<string | null>>;
  pending: boolean;
  setCircleMembership: (circleId: string, friendId: string, add: boolean) => void;
  toggleGiveSpace: (friend: FriendRow) => void;
  removeFriend: (friend: FriendRow) => Promise<void>;
  reportFriend: (friend: FriendRow) => Promise<void>;
  blockFriend: (friend: FriendRow) => Promise<void>;
}

export function FriendsSection({
  friends,
  circles,
  expandedFriend,
  setExpandedFriend,
  pending,
  setCircleMembership,
  toggleGiveSpace,
  removeFriend,
  reportFriend,
  blockFriend,
}: FriendsSectionProps) {
  if (friends.length === 0) return null;
  return (
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
                    <Avatar
                      name={friend.name}
                      seed={friend.id}
                      size="sm"
                      signal={friend.signal}
                    />
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
                      {circles.length === 0 && (
                        <p className="text-sm text-ink-faint">
                          No circles yet. Make one under Your circles below, then
                          sort people into it here.
                        </p>
                      )}
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
                                setCircleMembership(circle.id, friend.id, !inCircle)
                              }
                            >
                              {circle.name}
                            </Chip>
                          );
                        })}
                      </div>
                      <div className="mt-4 pt-3 border-t border-line">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => toggleGiveSpace(friend)}
                          className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                            friend.isAvoided
                              ? 'bg-gold-soft text-gold-deep'
                              : 'text-ink-faint hover:text-ink'
                          }`}
                        >
                          <Icon name={friend.isAvoided ? 'check' : 'bell'} size={14} />
                          {friend.isAvoided ? 'Giving space' : 'Give space'}
                        </button>
                        <p className="mt-1 text-[11px] leading-snug text-ink-faint">
                          {friend.isAvoided
                            ? 'When you say yes to a plan, we’ll tell you if someone you give space to may be there — never who, and never anything else.'
                            : 'If you say yes to a plan they may also be at, you get a private nudge. No block, they’re never told, and we never say who.'}
                        </p>
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
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => reportFriend(friend)}
                        className="ml-3 rounded-pill px-1 py-1 text-xs font-semibold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        Report
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => blockFriend(friend)}
                        className="ml-3 rounded-pill px-1 py-1 text-xs font-semibold text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                      >
                        Block
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
  );
}
