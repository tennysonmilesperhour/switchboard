'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { Switch } from '@/components/ui/Switch';
import { SwipeDeck, type SwipeDirection } from '@/components/ui/SwipeDeck';
import { useToast } from '@/components/ui/Toast';
import { recordDiscoverySignal } from '@/lib/actions/discovery-prefs';
import {
  SELVES,
  SELF_INFO,
  activityForLane,
  describeMoodRemaining,
  moodInfo,
  stripLane,
  type Self,
} from '@/lib/discovery-lanes';
import { requestToJoin } from '@/lib/actions/open-table';
import { downToConnect, withdrawIntent } from '@/lib/actions/mutual';
import { setDiscoverable } from '@/lib/actions/profile';
import { discoveryContextChoice } from '@/lib/discovery-context';
import { errorFor, type ErrorCode } from '@/lib/errors';
import { formatDateTime, formatRelative } from '@/lib/format';
import {
  AUDIENCES,
  BAND_LABEL,
  EXPLORE_RANGES,
  bandWithinRange,
  matchesAudience,
  type Audience,
  type DistanceBand,
  type ExploreRange,
} from '@/lib/nearby-plans';
import type { PendingJoinRequest } from '@/components/events/OpenTables';
import type {
  DiscoveryInterest,
  DiscoveryMatch,
  DiscoveryPerson,
} from './types';
import { PersonCard, sharedKeys } from './PersonCard';

export type ExploreMode = 'plans' | 'people';

/** A plan the reader could ask to join: broadcast nearby, or from their circle. */
export interface ExplorePlan {
  eventId: string;
  title: string;
  startsAt: string | null;
  timeZone: string | null;
  hostName: string;
  spotsLeft: number;
  /** Who in the reader's circle connects them to it, if anyone. */
  knownVia: string | null;
  /** Null for circle-only tables, which carry no location. */
  band: DistanceBand | null;
}

/** The preference filters people can be narrowed by (range is separate). */
const PREFERENCE_CATEGORIES = [
  { value: 'interests', label: 'Shared interests' },
  { value: 'involvements', label: 'Involved in' },
  { value: 'mutual friends', label: 'Mutual friends' },
] as const;

const MAX_CONTEXT_CHIPS = 12;

export function ExploreClient({
  initialMode,
  initialRange,
  hasHomePoint,
  plans,
  plansError,
  requests,
  requestsError,
  people,
  bands,
  matches,
  discoverable,
  interests,
  myContexts,
  peopleError,
  plansFooter,
  self = 'friends',
  laneOn = true,
  mood = null,
}: {
  initialMode: ExploreMode;
  initialRange: ExploreRange;
  /** Whether the reader has a city pinned, which range is measured from. */
  hasHomePoint: boolean;
  plans: ExplorePlan[];
  plansError: ErrorCode | null;
  requests: PendingJoinRequest[];
  requestsError: ErrorCode | null;
  people: DiscoveryPerson[];
  /** Distance band by profile id, for people who share a placeable city. */
  bands: Record<string, DistanceBand>;
  matches: DiscoveryMatch[];
  discoverable: boolean;
  interests: Record<string, DiscoveryInterest>;
  myContexts: string[];
  peopleError: ErrorCode | null;
  /** Shown under the plan deck: the idea generator and partner perks. */
  plansFooter?: ReactNode;
  /** The lane being browsed on the People side. */
  self?: Self;
  /** Whether the reader has that lane on. */
  laneOn?: boolean;
  /** The reader's own active mood, if any. */
  mood?: { preset: string; expires_at: string } | null;
}) {
  const [mode, setMode] = useState<ExploreMode>(initialMode);
  const [range, setRange] = useState<ExploreRange>(initialRange);

  function chooseMode(next: ExploreMode) {
    setMode(next);
    try {
      window.history.replaceState(null, '', `?mode=${next}&lane=${self}`);
    } catch {
      // A URL that cannot be updated is only a missing deep link.
    }
  }

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="What are you looking at?"
        className="grid grid-cols-2 gap-1 rounded-pill bg-cream p-1"
      >
        {(
          [
            { value: 'plans', label: 'Plans', hint: 'Things to join' },
            { value: 'people', label: 'People', hint: 'Who matches you' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={mode === tab.value}
            onClick={() => chooseMode(tab.value)}
            className={`rounded-pill px-3 py-2 text-sm font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-terracotta ${
              mode === tab.value
                ? 'bg-card text-ink shadow-lift'
                : 'text-ink-faint hover:text-ink-soft'
            }`}
          >
            {tab.label}
            <span className="block text-[11px] font-medium text-ink-faint">{tab.hint}</span>
          </button>
        ))}
      </div>

      <RangePicker range={range} onChange={setRange} hasHomePoint={hasHomePoint} />

      {mode === 'plans' ? (
        <PlansPane
          plans={plans}
          plansError={plansError}
          requests={requests}
          requestsError={requestsError}
          range={range}
          hasHomePoint={hasHomePoint}
          footer={plansFooter}
        />
      ) : (
        <PeoplePane
          people={people}
          bands={bands}
          matches={matches}
          discoverable={discoverable}
          interests={interests}
          myContexts={myContexts}
          loadError={peopleError}
          range={range}
          hasHomePoint={hasHomePoint}
          self={self}
          laneOn={laneOn}
          mood={mood}
        />
      )}
    </div>
  );
}

function RangePicker({
  range,
  onChange,
  hasHomePoint,
}: {
  range: ExploreRange;
  onChange: (range: ExploreRange) => void;
  hasHomePoint: boolean;
}) {
  const active = EXPLORE_RANGES.find((option) => option.value === range);
  return (
    <div className="space-y-2">
      <p className="text-plate text-plate-inset text-xs font-bold uppercase tracking-wide text-ink-soft">
        How far
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="How far">
        {EXPLORE_RANGES.map((option) => (
          <Chip
            key={option.value}
            selected={range === option.value}
            onClick={() => onChange(option.value)}
            className="shrink-0"
          >
            {option.label}
          </Chip>
        ))}
      </div>
      <p className="text-plate text-plate-inset text-xs text-ink-faint">
        {hasHomePoint
          ? `${active?.hint}. Measured from your city, never your live location.`
          : (
            <>
              Pick your city so we can measure range.{' '}
              <Link href="/profile/edit" className="font-bold text-terracotta-deep underline">
                Set your city
              </Link>
            </>
          )}
      </p>
    </div>
  );
}

function PlansPane({
  plans,
  plansError,
  requests,
  requestsError,
  range,
  hasHomePoint,
  footer,
}: {
  plans: ExplorePlan[];
  plansError: ErrorCode | null;
  requests: PendingJoinRequest[];
  requestsError: ErrorCode | null;
  range: ExploreRange;
  hasHomePoint: boolean;
  footer?: ReactNode;
}) {
  const [audience, setAudience] = useState<Audience>('all');
  const toast = useToast();
  const router = useRouter();

  const visible = useMemo(
    () =>
      plans.filter(
        (plan) =>
          // A circle table has no place to measure, so range does not hide it.
          (plan.band === null ? Boolean(plan.knownVia) : bandWithinRange(plan.band, range)) &&
          matchesAudience(plan.knownVia, audience),
      ),
    [plans, range, audience],
  );

  async function decide(plan: ExplorePlan, direction: SwipeDirection): Promise<boolean> {
    if (direction === 'left') return true;
    const result = await requestToJoin(plan.eventId);
    if (!result.ok) {
      toast.error(result.error ?? 'Could not send your request.', result.code);
      return false;
    }
    toast.success('Asked to join. The host will get back to you.');
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Whose plans">
        {AUDIENCES.map((option) => (
          <Chip
            key={option.value}
            selected={audience === option.value}
            onClick={() => setAudience(option.value)}
            className="shrink-0"
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {requestsError && (
        <ErrorNotice
          message="Your requests to join didn’t load."
          fix={errorFor(requestsError).fix}
          code={requestsError}
        />
      )}
      {requests.length > 0 && (
        <div className="space-y-2">
          <p className="text-plate text-plate-inset text-xs font-bold uppercase tracking-wide text-ink-soft">
            Waiting on the host
          </p>
          {requests.map((request) => (
            <Card key={request.inviteId}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{request.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {formatDateTime(request.startsAt, request.timeZone)} · You’ll hear back either
                    way.
                  </p>
                </div>
                <Link
                  href={`/events/${request.eventId}`}
                  className="shrink-0 rounded-pill px-2.5 py-1.5 text-xs font-bold text-terracotta-deep hover:bg-terracotta-soft"
                >
                  See the plan
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {plansError ? (
        <Card>
          <ErrorNotice
            message={errorFor(plansError).message}
            fix={errorFor(plansError).fix}
            code={plansError}
          />
        </Card>
      ) : (
        <SwipeDeck
          ariaLabel="Plans you can ask to join"
          items={visible}
          getKey={(plan) => plan.eventId}
          onDecide={decide}
          leftLabel="Pass"
          rightLabel="Ask to join"
          renderCard={(plan) => <PlanCard plan={plan} />}
          empty={
            <EmptyState
              emoji="🪑"
              title="No open plans in range"
              body={
                hasHomePoint
                  ? 'Try a wider range, or start one yourself. Hosts choose whether to show a plan to people nearby.'
                  : 'Set your city in Edit profile to see plans near you. Plans from your circle still show up here.'
              }
              action={
                <Link href="/events/new">
                  <Button size="sm">Start a plan</Button>
                </Link>
              }
            />
          }
        />
      )}
      <p className="text-center text-xs text-ink-faint">
        Swipe right asks the host. They approve every request.
      </p>

      {footer}
    </div>
  );
}

function PlanCard({ plan }: { plan: ExplorePlan }) {
  return (
    <Card tone="gold" lifted className="min-h-48 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-2xl leading-tight">{plan.title}</h3>
        <span className="shrink-0 rounded-pill bg-card px-2.5 py-1 text-xs font-bold text-terracotta-deep">
          {plan.spotsLeft} {plan.spotsLeft === 1 ? 'seat' : 'seats'}
        </span>
      </div>
      <p className="text-sm text-ink-soft">{formatDateTime(plan.startsAt, plan.timeZone)}</p>
      <div className="flex flex-wrap gap-1.5">
        {plan.band && (
          <span className="rounded-pill bg-card px-2 py-1 text-xs text-ink-soft">
            {BAND_LABEL[plan.band]}
          </span>
        )}
        <span className="rounded-pill bg-card px-2 py-1 text-xs text-ink-soft">
          {plan.knownVia ? `You know ${plan.knownVia}` : 'New people'}
        </span>
      </div>
      <p className="text-xs text-ink-faint">Hosted by {plan.hostName}</p>
    </Card>
  );
}

function PeoplePane({
  people,
  bands,
  matches,
  discoverable,
  interests,
  myContexts,
  loadError,
  range,
  hasHomePoint,
  self,
  laneOn,
  mood,
}: {
  people: DiscoveryPerson[];
  bands: Record<string, DistanceBand>;
  matches: DiscoveryMatch[];
  discoverable: boolean;
  interests: Record<string, DiscoveryInterest>;
  myContexts: string[];
  loadError: ErrorCode | null;
  range: ExploreRange;
  hasHomePoint: boolean;
  self: Self;
  laneOn: boolean;
  mood: { preset: string; expires_at: string } | null;
}) {
  const [wanted, setWanted] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<Record<string, string>>({});
  const [justMatched, setJustMatched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [discoverPending, startDiscoverTransition] = useTransition();
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  // What people are open to, most common first: the "preferences" to look by.
  const contextChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people) {
      for (const context of person.contexts) counts.set(context, (counts.get(context) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_CONTEXT_CHIPS)
      .map(([context]) => context);
  }, [people]);

  const interested = people.filter((person) => interests[person.id]);
  const visible = useMemo(
    () =>
      people.filter(
        (person) =>
          !interests[person.id] &&
          bandWithinRange(bands[person.id] ?? null, range) &&
          (wanted.length === 0 || person.contexts.some((context) => wanted.includes(context))) &&
          (category === null || person.categories.includes(category)),
      ),
    [people, interests, bands, range, wanted, category],
  );

  async function decide(person: DiscoveryPerson, direction: SwipeDirection): Promise<boolean> {
    if (direction === 'left') {
      // A pass is private history: it keeps this person out of this lane for a
      // month and feeds suggestions. They are never told.
      void recordDiscoverySignal(person.id, self, 'passed', sharedKeys(person));
      return true;
    }
    const context =
      selectedContext[person.id] || discoveryContextChoice(person, myContexts).defaultContext;
    // The lane rides in the saved text, so a dating tap and a friends tap on the
    // same context are different asks and cannot match each other.
    const result = await downToConnect(person.id, activityForLane(self, context), 'discover_connect');
    if (!result.ok) {
      toast.error(result.error ?? 'Could not save that quietly.', result.code);
      return false;
    }
    void recordDiscoverySignal(person.id, self, 'accepted', sharedKeys(person));
    if (result.matched) {
      setJustMatched(true);
      toast.success('It is mutual.');
    } else {
      toast.success('Saved privately. Nothing is sent unless it’s mutual.');
    }
    router.refresh();
    return true;
  }

  function withdraw(person: DiscoveryPerson, interest: DiscoveryInterest) {
    setWithdrawingId(person.id);
    startTransition(async () => {
      const result = await withdrawIntent(interest.id);
      setWithdrawingId(null);
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
    <div className="space-y-5">
      <nav aria-label="Lanes" className="flex gap-2 overflow-x-auto pb-1">
        {SELVES.map((option) => (
          <Link
            key={option}
            href={`/discover?mode=people&lane=${option}`}
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
        <Link
          href={`/discover/preferences?lane=${self}`}
          className="shrink-0 self-center px-2 text-sm font-bold text-terracotta-deep"
        >
          Discovery settings
        </Link>
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

      {discoverable && !laneOn ? (
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
      ) : null}

      <Link href="/people" className="group block">
        <Card className="transition-colors group-hover:border-terracotta">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-bold">Already know someone?</span>
              <span className="block text-xs text-ink-faint">
                Add friends directly by handle, email, phone, or contacts.
              </span>
            </span>
            <span className="whitespace-nowrap text-sm font-bold text-terracotta-deep">Add →</span>
          </div>
        </Card>
      </Link>

      <Card tone="cream">
        <p className="text-sm leading-relaxed text-ink-soft">
          Swiping right means you are open to connecting for the chosen context. Nothing is sent
          unless it is mutual. If it matches, show up with curiosity, kindness, and generous
          assumptions.
          <Link href="/community" className="ml-1 font-bold text-terracotta-deep">
            Read the covenant.
          </Link>
        </p>
      </Card>

      {!discoverable && (
        <Card tone="terracotta">
          <p className="text-sm font-bold text-terracotta-deep">You are not discoverable.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Discovery is see-and-be-seen: you browse people here only while they can find you too.
            Turn it on to look around. Your interest in anyone stays private unless it is mutual,
            and you can turn it off anytime.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-terracotta/20 pt-3">
            <span className="text-sm font-bold text-terracotta-deep">Show me in discovery</span>
            <Switch
              checked={false}
              label="Show me in people discovery"
              disabled={discoverPending}
              onCheckedChange={enableDiscoverability}
            />
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Fine-tune what people see anytime in{' '}
            <Link href="/settings" className="font-bold text-terracotta-deep">
              Settings
            </Link>
            .
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

      {discoverable && laneOn && (
        <>
          <div className="space-y-2">
            <p className="text-plate text-plate-inset text-xs font-bold uppercase tracking-wide text-ink-soft">
              Looking for
              <span className="font-normal normal-case tracking-normal text-ink-faint">
                {' '}
                · pick any
              </span>
            </p>
            {contextChips.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Looking for">
                {contextChips.map((context) => (
                  <Chip
                    key={context}
                    selected={wanted.includes(context)}
                    onClick={() =>
                      setWanted((current) =>
                        current.includes(context)
                          ? current.filter((value) => value !== context)
                          : [...current, context],
                      )
                    }
                  >
                    {context}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-faint">
                Nobody has listed what they are open to yet.
              </p>
            )}
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Matching on">
              {PREFERENCE_CATEGORIES.map((option) => (
                <Chip
                  key={option.value}
                  selected={category === option.value}
                  onClick={() => setCategory(category === option.value ? null : option.value)}
                  className="shrink-0"
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>

          {interested.length > 0 && (
            <details className="rounded-card bg-sage-soft px-3.5 py-2.5">
              <summary className="cursor-pointer text-sm font-bold text-sage-deep">
                You’re interested in {interested.length}{' '}
                {interested.length === 1 ? 'person' : 'people'}
              </summary>
              <ul className="mt-2 space-y-2">
                {interested.map((person) => {
                  const interest = interests[person.id];
                  return (
                    <li key={person.id} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        <strong>{person.display_name}</strong> · {stripLane(interest.activity)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending && withdrawingId === person.id}
                        onClick={() => withdraw(person, interest)}
                      >
                        {pending && withdrawingId === person.id ? 'Withdrawing' : 'Withdraw'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-ink-soft">
                They only find out if they pick you too.
              </p>
            </details>
          )}

          {loadError ? (
            <Card>
              <ErrorNotice
                message={errorFor(loadError).message}
                fix={errorFor(loadError).fix}
                code={loadError}
              />
            </Card>
          ) : (
            <SwipeDeck
              ariaLabel="People who might match you"
              items={visible}
              getKey={(person) => person.id}
              onDecide={decide}
              leftLabel="Pass"
              rightLabel="Interested"
              renderCard={(person) => (
                <PersonCard
                  person={person}
                  band={bands[person.id] ?? null}
                  myContexts={myContexts}
                  chosen={selectedContext[person.id]}
                  onChoose={(context) =>
                    setSelectedContext((current) => ({ ...current, [person.id]: context }))
                  }
                />
              )}
              empty={
                <EmptyState
                  emoji="◐"
                  title="No one in range yet"
                  body={
                    hasHomePoint
                      ? 'Try a wider range or fewer filters. Discovery is opt-in, so the pool grows as more people join in.'
                      : 'Pick Anywhere to see people with no city set, or set your own city so range can work.'
                  }
                />
              }
            />
          )}
        </>
      )}
    </div>
  );
}
