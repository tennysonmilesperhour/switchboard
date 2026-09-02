'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ACTIVITY_PRESETS } from '@/lib/types';
import type { FriendRow } from './types';

interface MatchmakerSectionProps {
  friends: FriendRow[];
  pending: boolean;
  matchA: string;
  setMatchA: Dispatch<SetStateAction<string>>;
  matchB: string;
  setMatchB: Dispatch<SetStateAction<string>>;
  matchActivity: string;
  setMatchActivity: Dispatch<SetStateAction<string>>;
  matchNote: string;
  setMatchNote: Dispatch<SetStateAction<string>>;
  matchStatus: string;
  submitMatch: () => void;
}

export function MatchmakerSection({
  friends,
  pending,
  matchA,
  setMatchA,
  matchB,
  setMatchB,
  matchActivity,
  setMatchActivity,
  matchNote,
  setMatchNote,
  matchStatus,
  submitMatch,
}: MatchmakerSectionProps) {
  if (friends.length < 2) return null;
  return (
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
                onClick={submitMatch}
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
  );
}
