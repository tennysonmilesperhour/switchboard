'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import type { FriendRow, HouseholdRow } from './types';

interface HouseholdsSectionProps {
  friends: FriendRow[];
  households: HouseholdRow[];
  pending: boolean;
  householdName: string;
  setHouseholdName: Dispatch<SetStateAction<string>>;
  householdMembers: string[];
  setHouseholdMembers: Dispatch<SetStateAction<string[]>>;
  removeHousehold: (household: HouseholdRow) => Promise<void>;
  createNewHousehold: () => void;
  /** Resolves true when the new member list saved. */
  saveHouseholdMembers: (household: HouseholdRow, memberIds: string[]) => Promise<boolean>;
}

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

export function HouseholdsSection({
  friends,
  households,
  pending,
  householdName,
  setHouseholdName,
  householdMembers,
  setHouseholdMembers,
  removeHousehold,
  createNewHousehold,
  saveHouseholdMembers,
}: HouseholdsSectionProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  if (friends.length === 0) return null;

  function startEditing(household: HouseholdRow) {
    if (editing === household.id) {
      setEditing(null);
      return;
    }
    setEditing(household.id);
    setDraft(household.memberIds ?? []);
  }

  async function saveEdit(household: HouseholdRow) {
    if (await saveHouseholdMembers(household, draft)) setEditing(null);
  }

  return (
    <section>
      <SectionHeader
        title="Households 🏡"
        hint="Invite a whole family or roommate crew with one tap"
      />
      {/* D9: the household chip picks the set; one person picks one person. */}
      <p className="mb-3 text-xs leading-snug text-ink-faint">
        When you invite people, tapping a household selects everyone in it. Picking one
        person from it selects just them.
      </p>
      {households.length > 0 && (
        <div className="space-y-2 mb-3">
          {households.map((household) => {
            const isEditing = editing === household.id;
            // Someone you are no longer connected to can still be in a household
            // (and can be taken out); they just can't be added back.
            const strays = (household.memberIds ?? []).filter(
              (id) => !friends.some((friend) => friend.id === id),
            );
            return (
              <div key={household.id} className="rounded-card bg-cream px-3.5 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-lg" aria-hidden>{household.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{household.name}</span>
                    {/* Names, not just a count: there is no other way to see
                        who a household will invite. */}
                    <span className="block truncate text-xs text-ink-faint">
                      {(household.memberIds ?? [])
                        .map((id) => friends.find((f) => f.id === id)?.name.split(' ')[0])
                        .filter(Boolean)
                        .join(', ') ||
                        `${household.memberCount} ${household.memberCount === 1 ? 'person' : 'people'}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    aria-expanded={isEditing}
                    className="min-h-11 rounded-pill px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    onClick={() => startEditing(household)}
                  >
                    {isEditing ? 'Close' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="min-h-11 rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    onClick={() => removeHousehold(household)}
                  >
                    Remove
                  </button>
                </div>
                {isEditing && (
                  <div className="mt-3 border-t border-line pt-3 animate-rise">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
                      Who’s in {household.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {friends.map((friend) => {
                        const selected = draft.includes(friend.id);
                        return (
                          <Chip
                            key={friend.id}
                            selected={selected}
                            disabled={pending}
                            onClick={() =>
                              setDraft((current) =>
                                selected
                                  ? current.filter((id) => id !== friend.id)
                                  : [...current, friend.id],
                              )
                            }
                          >
                            {firstName(friend.name)}
                          </Chip>
                        );
                      })}
                      {strays
                        .filter((id) => draft.includes(id))
                        .map((id) => (
                          <Chip
                            key={id}
                            selected
                            disabled={pending}
                            onClick={() => setDraft((current) => current.filter((x) => x !== id))}
                          >
                            Someone you’re no longer connected to
                          </Chip>
                        ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending || draft.length === 0}
                        onClick={() => saveEdit(household)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                    {draft.length === 0 && (
                      <p className="mt-2 text-xs text-ink-faint">
                        A household needs at least one person. Remove the household instead if
                        you don’t need it.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
                  {firstName(friend.name)}
                </Chip>
              );
            })}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            disabled={pending || !householdName.trim() || householdMembers.length === 0}
            onClick={createNewHousehold}
          >
            Create household
          </Button>
        </div>
      </Card>
    </section>
  );
}
