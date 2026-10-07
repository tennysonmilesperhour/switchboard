'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Switch } from '@/components/ui/Switch';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { useToast } from '@/components/ui/Toast';
import { BlockReportButtons } from '@/components/profile/BlockReportButtons';
import { downToConnect, withdrawIntent } from '@/lib/actions/mutual';
import { setDiscoverable } from '@/lib/actions/profile';
import { formatRelative } from '@/lib/format';
import { errorFor, type ErrorCode } from '@/lib/errors';
import { discoveryContextChoice } from '@/lib/discovery-context';
import { Glyph } from '@/components/ui/Glyph';
import { TrustLabel } from '@/components/profile/FactList';
import { recordDiscoverySignal } from '@/lib/actions/discovery-prefs';
import type { DiscoveryPerson } from '@/lib/discovery-people';
import {
  FIT_LABEL,
  SELVES,
  SELF_INFO,
  activityForLane,
  describeMoodRemaining,
  itemKey,
  moodInfo,
  stripLane,
  type Self,
} from '@/lib/discovery-lanes';

export type { DiscoveryPerson };

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

/** Items a card showed, as the keys weights are stored under. */
function sharedKeys(person: DiscoveryPerson): string[] {
  return [
    ...person.shared_interests.map((label) => itemKey('interest', label)),
    ...person.shared_down_to.map((label) => itemKey('down_to', label)),
  ];
}

/** The reader's own open "Interested" mark on someone, by their profile id. */
export interface DiscoveryInterest {
  id: string;
  activity: string;
}

export function PeopleDiscoveryClient({
  people,
  matches,
  discoverable,
  self = 'friends',
  laneOn = true,
  mood = null,
  interests = {},
  myContexts = [],
  loadError = null,
}: {
  people: DiscoveryPerson[];
  matches: DiscoveryMatch[];
  discoverable: boolean;
  /** The lane being browsed. */
  self?: Self;
  /** Whether the reader has this lane on. */
  laneOn?: boolean;
  /** The reader's own active mood, if any. */
  mood?: { preset: string; expires_at: string } | null;
  /** The reader's own contexts, so a tap defaults to one both people offer. */
  myContexts?: string[];
  /** Keyed by target profile id. */
  interests?: Record<string, DiscoveryInterest>;
  /** The people lookup failed; say so instead of showing an empty lane. */
  loadError?: ErrorCode | null;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');
  const [selectedContext, setSelectedContext] = useState<Record<string, string>>({});
  const [justMatched, setJustMatched] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [discoverPending, startDiscoverTransition] = useTransition();
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
      selectedContext[person.id] || discoveryContextChoice(person, myContexts).defaultContext;
    setPendingId(person.id);
    startTransition(async () => {
      // The lane rides in the saved text, so a dating tap and a friends tap on
      // the same context are different asks and cannot match each other.
      const result = await downToConnect(person.id, activityForLane(self, context), 'discover_connect');
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save that quietly.', result.code);
        return;
      }
      // Private history, used only to offer suggestions. Never blocks the tap.
      void recordDiscoverySignal(person.id, self, 'accepted', sharedKeys(person));
      if (result.matched) {
        setJustMatched(true);
        toast.success('It is mutual.');
      } else {
        toast.success('Saved privately. Nothing is sent unless it’s mutual.');
      }
      router.refresh();
    });
  }

  function pass(person: DiscoveryPerson) {
    setPendingId(person.id);
    startTransition(async () => {
      const result = await recordDiscoverySignal(person.id, self, 'passed', sharedKeys(person));
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save that.', result.code);
        return;
      }
      toast.success(`Okay. ${person.display_name} won’t be told, and won’t reappear here for a month.`);
      router.refresh();
    });
  }

  function withdraw(person: DiscoveryPerson, interest: DiscoveryInterest) {
    setPendingId(person.id);
    startTransition(async () => {
      const result = await withdrawIntent(interest.id);
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not take that back.', result.code);
        return;
      }
      toast.success(`Withdrawn. ${person.display_name} was never told either way.`);
      router.refresh();
    });
  }

  function enableDiscoverability() {
    startDiscoverTransition(async () => {
      const result = await setDiscoverable(true);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not turn on discoverability.', result.code);
        return;
      }
      toast.success('You are discoverable now.');
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="People discovery"
        hint="Opt-in, context-specific, and private until both people choose each other"
        action={
          <Link
            href={`/discover/preferences?lane=${self}`}
            className="text-sm font-bold text-terracotta-deep hover:text-terracotta-deep"
          >
            Discovery settings
          </Link>
        }
      />

      <nav aria-label="Lanes" className="flex gap-2 overflow-x-auto pb-1">
        {SELVES.map((option) => (
          <Link
            key={option}
            href={`/discover?lane=${option}#browse`}
            aria-current={option === self ? 'page' : undefined}
            className={`shrink-0 rounded-pill border px-4 py-2 text-sm font-semibold transition-colors ${
              option === self
                ? 'border-terracotta bg-terracotta text-white'
                : 'border-line bg-card text-ink-soft hover:border-terracotta'
            }`}
          >
            {SELF_INFO[option].label}
          </Link>
        ))}
      </nav>

      {mood ? (
        <Link href={`/discover/preferences?lane=${self}`} className="block">
          <Card tone="sage">
            <p className="text-sm text-sage-deep">
              <strong>{moodInfo(mood.preset)?.label ?? 'Custom mood'}</strong> ·{' '}
              {describeMoodRemaining(mood.expires_at)}. Only people who clear your current bar
              are shown. <span className="font-bold underline">Change</span>
            </p>
          </Card>
        </Link>
      ) : null}

      <Link href="/people" className="block group">
        <Card className="group-hover:border-terracotta transition-colors">
          <div className="flex items-center gap-3">
            <Glyph emoji="👋" size={20} />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-bold">Already know someone?</span>
              <span className="block text-xs text-ink-faint">
                Add friends directly by handle, email, phone, or contacts.
              </span>
            </span>
            <span className="text-sm font-bold text-terracotta-deep whitespace-nowrap">Add →</span>
          </div>
        </Card>
      </Link>

      <Card tone="cream">
        <p className="text-sm leading-relaxed text-ink-soft">
          Marking interest means you are open to connecting for the selected
          context. Nothing is sent unless it is mutual. If it matches, show up
          for that context with curiosity, kindness, and generous assumptions.
          <Link href="/community" className="ml-1 font-bold text-terracotta-deep">
            Read the covenant.
          </Link>
        </p>
      </Card>

      {!discoverable && (
        <Card tone="terracotta">
          <p className="text-sm font-bold text-terracotta-deep">You are not discoverable.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Discovery is see-and-be-seen: you browse people here only while they
            can find you too. Turn it on to look around — your interest in anyone
            stays private unless it is mutual, and you can turn it off anytime.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-terracotta/20 pt-3">
            <span className="text-sm font-bold text-terracotta-deep">
              Show me in discovery
            </span>
            <Switch
              checked={false}
              label="Show me in people discovery"
              disabled={discoverPending}
              onCheckedChange={enableDiscoverability}
            />
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Fine-tune what people see - location, interests, mutual friends - anytime in{' '}
            <Link href="/settings" className="font-bold text-terracotta-deep">
              Settings
            </Link>
            .
          </p>
        </Card>
      )}

      {discoverable && !laneOn && (
        <Card tone="cream">
          <p className="text-sm font-bold">
            {SELF_INFO[self].label} is {mood ? 'resting or ' : ''}off.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {SELF_INFO[self].blurb} Turn it on in discovery settings to browse here and be found
            here.
          </p>
          <Link href={`/discover/preferences?lane=${self}`} className="mt-3 inline-block">
            <Button size="sm">Open discovery settings</Button>
          </Link>
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

      {discoverable && laneOn && (
      <>
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

      {loadError ? (
        <Card>
          <ErrorNotice
            message={errorFor(loadError).message}
            fix={errorFor(loadError).fix}
            code={loadError}
          />
        </Card>
      ) : visiblePeople.length === 0 ? (
        filter === 'geography' ? (
          <EmptyState
            emoji="📍"
            title="No one nearby yet"
            body="Nearby compares your home area with people who share theirs. Turn on Geography under Discoverability in Settings, then in Edit profile pick your city from the suggestions under City or area so it shows as pinned. That counts you, and shows you who else is close."
          />
        ) : (
          <EmptyState
            emoji="◐"
            title="No one in this lane yet"
            body="Discovery is opt-in. As more people choose contexts, they will show up here."
          />
        )
      ) : (
        <div className="space-y-3">
          {visiblePeople.map((person) => {
            const { options: contextOptions, defaultContext } = discoveryContextChoice(
              person,
              myContexts,
            );
            const chosen = selectedContext[person.id] || defaultContext;
            const interest = interests[person.id];
            const profileHref = `/u/${encodeURIComponent(person.handle)}?from=/discover`;
            return (
              <Card key={person.id}>
                <div className="flex items-start gap-3">
                  <Link href={profileHref} aria-label={`${person.display_name}’s profile`}>
                    <Avatar name={person.display_name} seed={person.id} src={person.avatar_url} size="md" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={profileHref}
                          className="block truncate font-display text-lg hover:text-terracotta-deep"
                        >
                          {person.display_name}
                        </Link>
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
                    {person.blurb && (
                      <p className="mt-1 text-sm italic leading-relaxed text-ink-soft">
                        {person.blurb}
                      </p>
                    )}
                    {person.shared_facts.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {person.shared_facts.map((fact) => (
                          <li key={`${fact.kind}:${fact.label}`} className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                            <span>Also at <strong>{fact.label}</strong></span>
                            <TrustLabel tier={fact.tier} />
                          </li>
                        ))}
                      </ul>
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
                    <p className="mt-1 text-xs font-semibold text-ink-faint">{FIT_LABEL[person.fit]}</p>
                    {interest ? (
                      <div className="mt-3 flex flex-col gap-2 rounded-card bg-sage-soft px-3 py-2.5 sm:flex-row sm:items-center">
                        <p className="min-w-0 flex-1 text-sm text-sage-deep">
                          <strong>You’re interested</strong> · {stripLane(interest.activity)}. They only
                          find out if they pick you too.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending && pendingId === person.id}
                          onClick={() => withdraw(person, interest)}
                        >
                          {pending && pendingId === person.id ? 'Withdrawing' : 'Withdraw'}
                        </Button>
                      </div>
                    ) : (
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
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending && pendingId === person.id}
                        onClick={() => pass(person)}
                      >
                        Not for me
                      </Button>
                    </div>
                    )}
                    <div className="mt-2 border-t border-line pt-1.5">
                      <BlockReportButtons targetId={person.id} name={person.display_name} />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </>
      )}
    </section>
  );
}
