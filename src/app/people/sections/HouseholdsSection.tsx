'use client';

import type { Dispatch, SetStateAction } from 'react';
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
}: HouseholdsSectionProps) {
  if (friends.length === 0) return null;
  return (
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
                onClick={createNewHousehold}
>
                Create household
              </Button>
            </div>
          </Card>
        </section>
  );
}
