'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { downToConnect } from '@/lib/actions/mutual';
import { formatRelative } from '@/lib/format';

export interface DiscoveryPerson {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  tagline: string | null;
  location: string | null;
  pronouns: string | null;
  categories: string[];
  contexts: string[];
  shared_interests: string[];
  shared_down_to: string[];
  mutual_friend_count: number;
}

export interface DiscoveryMatch {
  id: string;
  otherId: string;
  otherName: string;
  activity: string;
  roomId: string | null;
  createdAt: string;
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'geography', label: 'Nearby' },
  { value: 'interests', label: 'Interests' },
  { value: 'involvements', label: 'Involved in' },
  { value: 'mutual friends', label: 'Mutuals' },
] as const;

export function PeopleDiscoveryClient({
  people,
  matches,
  discoverable,
}: {
  people: DiscoveryPerson[];
  matches: DiscoveryMatch[];
  discoverable: boolean;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');
  const [selectedContext, setSelectedContext] = useState<Record<string, string>>({});
  const [justMatched, setJustMatched] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const visiblePeople = useMemo(
    () =>
      filter === 'all'
        ? people
        : people.filter((person) => person.categories.includes(filter)),
    [filter, people],
  );

  function quietConnect(person: DiscoveryPerson) {
    const context =
      selectedContext[person.id] ||
      person.contexts[0] ||
      person.shared_down_to[0] ||
      person.shared_interests[0] ||
      'Connect';
    setPendingId(person.id);
    startTransition(async () => {
      const result = await downToConnect(person.id, context, 'discover_connect');
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save that quietly.');
        return;
      }
      if (result.matched) {
        setJustMatched(true);
        toast.success('It is mutual.');
      } else {
        toast.success('Saved privately.');
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="People discovery"
        hint="Opt-in, context-specific, and private until both people choose each other"
        action={
          <Link href="/settings" className="text-sm font-bold text-terracotta hover:text-terracotta-deep">
            Settings
          </Link>
        }
      />

      {!discoverable && (
        <Card tone="terracotta">
          <p className="text-sm font-bold text-terracotta-deep">You are not discoverable.</p>
          <p className="mt-1 text-sm text-ink-soft">
            You can still browse, but turn on discoverability in Settings when you want
            others to find you through shared contexts.
          </p>
        </Card>
      )}

      {justMatched && (
        <Card tone="sage" lifted className="animate-rise">
          <p className="font-display text-xl text-sage-deep">It is mutual.</p>
          <p className="mt-1 text-sm text-ink-soft">
            You both chose the same context. A private room is ready below.
          </p>
        </Card>
      )}

      {matches.length > 0 && (
        <div className="space-y-2">
          {matches.map((match) => (
            <Card key={match.id} tone="sage">
              <div className="flex items-center gap-3">
                <Avatar name={match.otherName} seed={match.otherId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{match.otherName}</p>
                  <p className="text-xs text-ink-faint">
                    {match.activity} · matched {formatRelative(match.createdAt)}
                  </p>
                </div>
                {match.roomId && (
                  <Link href={`/rooms/${match.roomId}`}>
                    <Button size="sm">Say hi</Button>
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            selected={filter === option.value}
            onClick={() => setFilter(option.value)}
            className="shrink-0"
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {visiblePeople.length === 0 ? (
        <EmptyState
          emoji="◐"
          title="No one in this lane yet"
          body="Discovery is opt-in. As more people choose contexts, they will show up here."
        />
      ) : (
        <div className="space-y-3">
          {visiblePeople.map((person) => {
            const contextOptions = [
              ...new Set([
                ...person.contexts,
                ...person.shared_down_to,
                ...person.shared_interests,
              ]),
            ].slice(0, 8);
            const chosen = selectedContext[person.id] || contextOptions[0] || 'Connect';
            return (
              <Card key={person.id}>
                <div className="flex items-start gap-3">
                  <Avatar name={person.display_name} seed={person.id} src={person.avatar_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg">{person.display_name}</p>
                        <p className="truncate text-xs text-ink-faint">
                          @{person.handle}
                          {person.location ? ` · ${person.location}` : ''}
                          {person.pronouns ? ` · ${person.pronouns}` : ''}
                        </p>
                      </div>
                      {person.mutual_friend_count > 0 && (
                        <span className="rounded-pill bg-cream px-2 py-1 text-xs font-bold text-ink-soft">
                          {person.mutual_friend_count} mutual
                        </span>
                      )}
                    </div>
                    {person.tagline && (
                      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                        {person.tagline}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {person.categories.map((category) => (
                        <span key={category} className="rounded-pill bg-cream px-2 py-1 text-xs text-ink-soft">
                          {category}
                        </span>
                      ))}
                    </div>
                    {(person.shared_interests.length > 0 || person.shared_down_to.length > 0) && (
                      <p className="mt-2 text-xs text-ink-faint">
                        Shared: {[...person.shared_interests, ...person.shared_down_to]
                          .slice(0, 4)
                          .join(', ')}
                      </p>
                    )}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <select
                        value={chosen}
                        onChange={(event) =>
                          setSelectedContext((current) => ({
                            ...current,
                            [person.id]: event.target.value,
                          }))
                        }
                        aria-label={`Context for ${person.display_name}`}
                        className="min-w-0 flex-1 rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
                      >
                        {contextOptions.length > 0 ? (
                          contextOptions.map((context) => (
                            <option key={context} value={context}>
                              {context}
                            </option>
                          ))
                        ) : (
                          <option value="Connect">Connect</option>
                        )}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending && pendingId === person.id}
                        onClick={() => quietConnect(person)}
                      >
                        {pending && pendingId === person.id ? 'Saving' : 'Interested'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
