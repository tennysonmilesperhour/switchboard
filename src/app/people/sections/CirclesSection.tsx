'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { CircleRow, FriendRow } from './types';

interface CirclesSectionProps {
  circles: CircleRow[];
  friends: FriendRow[];
  expandedCircle: string | null;
  toggleCircleOpen: (circle: CircleRow) => void;
  pending: boolean;
  setCircleMembership: (circleId: string, friendId: string, add: boolean) => void;
  editEmoji: string;
  setEditEmoji: Dispatch<SetStateAction<string>>;
  editName: string;
  setEditName: Dispatch<SetStateAction<string>>;
  saveCircleName: (circle: CircleRow) => void;
  removeCircle: (circle: CircleRow) => Promise<void>;
  circleEmoji: string;
  setCircleEmoji: Dispatch<SetStateAction<string>>;
  newCircle: string;
  setNewCircle: Dispatch<SetStateAction<string>>;
  createNewCircle: (event: FormEvent) => void;
}

export function CirclesSection({
  circles,
  friends,
  expandedCircle,
  toggleCircleOpen,
  pending,
  setCircleMembership,
  editEmoji,
  setEditEmoji,
  editName,
  setEditName,
  saveCircleName,
  removeCircle,
  circleEmoji,
  setCircleEmoji,
  newCircle,
  setNewCircle,
  createNewCircle,
}: CirclesSectionProps) {
  return (
      <section>
        <SectionHeader
          title="Your circles"
          hint="Private groupings, reused everywhere you choose an audience. Tap one to see and add people."
        />
        {circles.length === 0 ? (
          <Card tone="cream">
            <p className="text-sm text-ink-soft leading-relaxed">
              Circles are your own private groupings - Close Friends, Book Club,
              Neighbors. Nobody sees them but you. Make your first one below, then
              tap it to add people.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {circles.map((circle) => {
              const members = friends.filter((f) => f.circleIds.includes(circle.id));
              const available = friends.filter((f) => !f.circleIds.includes(circle.id));
              const expanded = expandedCircle === circle.id;
              return (
                <Card key={circle.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    aria-expanded={expanded}
                    onClick={() => toggleCircleOpen(circle)}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cream text-lg" aria-hidden>
                      {circle.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-bold block truncate">{circle.name}</span>
                      <span className="text-xs text-ink-faint">
                        {members.length} {members.length === 1 ? 'person' : 'people'}
                      </span>
                    </span>
                    <Icon
                      name="back"
                      size={18}
                      className={`text-ink-faint transition-transform ${expanded ? 'rotate-90' : '-rotate-90'}`}
                    />
                  </button>

                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-line animate-rise space-y-4">
                      {/* Who's in it */}
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">
                          In this circle
                        </p>
                        {members.length === 0 ? (
                          <p className="text-sm text-ink-faint">
                            No one yet - add people below.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {members.map((member) => (
                              <li key={member.id} className="flex items-center gap-2.5">
                                <Avatar name={member.name} seed={member.id} size="sm" />
                                <span className="flex-1 min-w-0">
                                  <span className="text-sm font-semibold block truncate">
                                    {member.name}
                                  </span>
                                  <span className="text-xs text-ink-faint">@{member.handle}</span>
                                </span>
                                <button
                                  type="button"
                                  disabled={pending}
                                  aria-label={`Remove ${member.name} from ${circle.name}`}
                                  onClick={() => setCircleMembership(circle.id, member.id, false)}
                                  className="shrink-0 rounded-full p-1 text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                                >
                                  <Icon name="close" size={16} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Add people */}
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-ink-faint mb-2">
                          Add people
                        </p>
                        {friends.length === 0 ? (
                          <p className="text-sm text-ink-faint">
                            Connect with people first - then you can sort them in here.
                          </p>
                        ) : available.length === 0 ? (
                          <p className="text-sm text-ink-faint">
                            Everyone you’re connected with is already in this circle.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {available.map((friend) => (
                              <Chip
                                key={friend.id}
                                emoji="+"
                                disabled={pending}
                                onClick={() => setCircleMembership(circle.id, friend.id, true)}
                              >
                                {friend.name.split(' ')[0]}
                              </Chip>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Rename / delete */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input
                          value={expanded ? editEmoji : circle.emoji}
                          onChange={(e) => setEditEmoji(e.target.value)}
                          aria-label={`Emoji for ${circle.name}`}
                          maxLength={16}
                          className="w-12 rounded-card border border-line bg-paper px-2 py-2 text-center text-base outline-none focus:border-terracotta"
                        />
                        <input
                          value={expanded ? editName : circle.name}
                          onChange={(e) => setEditName(e.target.value)}
                          aria-label={`Rename ${circle.name}`}
                          maxLength={40}
                          className="flex-1 min-w-0 rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={
                            pending ||
                            !editName.trim() ||
                            (editName.trim() === circle.name && editEmoji.trim() === circle.emoji)
                          }
                          onClick={() => saveCircleName(circle)}
                        >
                          Save
                        </Button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => removeCircle(circle)}
                          className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-semibold text-rose-deep hover:text-rose-deep/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                        >
                          <Icon name="trash" size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
        <form
          className="flex gap-2 mt-3"
          onSubmit={createNewCircle}
>
          <input
            value={circleEmoji}
            onChange={(e) => setCircleEmoji(e.target.value)}
            aria-label="New circle emoji"
            maxLength={16}
            className="w-12 rounded-pill border border-line bg-card px-2 py-2.5 text-center text-base outline-none focus:border-terracotta"
          />
          <input
            value={newCircle}
            onChange={(e) => setNewCircle(e.target.value)}
            placeholder="New circle (e.g. Book Club)"
            aria-label="New circle name"
            maxLength={40}
            className="flex-1 min-w-0 rounded-pill border border-line bg-card px-4 py-2.5 text-sm outline-none focus:border-terracotta"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={pending || !newCircle.trim()}>
            Add
          </Button>
        </form>
      </section>
  );
}
