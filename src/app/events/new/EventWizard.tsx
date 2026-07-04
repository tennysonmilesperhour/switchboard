'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { suggestWindow, WINDOW_CHOICES } from '@/lib/engine/windows';
import { simulateCascade } from '@/lib/engine/cascade';
import { createEvent, type CreateEventInput } from '@/lib/actions/events';
import type { InviteMode } from '@/lib/types';

export interface WizardFriend {
  id: string;
  name: string;
  handle: string;
}

interface DraftInvitee {
  key: string;
  profileId: string | null;
  name: string;
  guestContact?: string;
  groupStage: number;
  windowMinutes: number;
}

const STEPS = ['Basics', 'Style', 'People', 'Order', 'Visibility', 'Review'] as const;

const MODE_OPTIONS: Array<{
  mode: InviteMode;
  title: string;
  body: string;
  emoji: string;
}> = [
  {
    mode: 'individual',
    emoji: '🪜',
    title: 'One at a time',
    body: 'Invite people in your order. When someone accepts, the cascade stops. Perfect for coffee, lunch, or last-minute plans.',
  },
  {
    mode: 'group',
    emoji: '🌊',
    title: 'In waves',
    body: 'Invite groups in stages. Later waves only go out if spots remain — events fill naturally without overbooking.',
  },
  {
    mode: 'all_at_once',
    emoji: '📣',
    title: 'Everyone at once',
    body: 'A classic invitation to your whole list, with a response window.',
  },
];

export function EventWizard({
  friends,
  initialTitle = '',
  initialDescription = '',
}: {
  friends: WizardFriend[];
  initialTitle?: string;
  initialDescription?: string;
}) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1 — basics
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [locationName, setLocationName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [capacity, setCapacity] = useState('');

  // Step 2 — style
  const [inviteMode, setInviteMode] = useState<InviteMode>('individual');
  const [enablePoll, setEnablePoll] = useState(false);
  const [pollResolution, setPollResolution] =
    useState<CreateEventInput['pollResolution']>('host_pick');

  // Step 3/4 — people & order
  const [invitees, setInvitees] = useState<DraftInvitee[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');

  // Step 5 — visibility
  const [showInviteList, setShowInviteList] = useState(false);
  const [showAccepted, setShowAccepted] = useState(true);
  const [showExpired, setShowExpired] = useState(false);

  const startsAt = useMemo(() => {
    if (!date) return null;
    return new Date(`${date}T${time || '18:00'}`).toISOString();
  }, [date, time]);

  const suggested = useMemo(
    () => suggestWindow(startsAt ? new Date(startsAt) : new Date(), new Date()),
    [startsAt],
  );

  function toggleFriend(friend: WizardFriend) {
    setInvitees((current) => {
      const existing = current.find((i) => i.profileId === friend.id);
      if (existing) return current.filter((i) => i.profileId !== friend.id);
      return [
        ...current,
        {
          key: friend.id,
          profileId: friend.id,
          name: friend.name,
          groupStage: 0,
          windowMinutes: suggested.windowMinutes,
        },
      ];
    });
  }

  function addGuest() {
    const name = guestName.trim();
    if (!name) return;
    setInvitees((current) => [
      ...current,
      {
        key: `guest-${name}-${current.length}`,
        profileId: null,
        name,
        guestContact: guestContact.trim() || undefined,
        groupStage: 0,
        windowMinutes: suggested.windowMinutes,
      },
    ]);
    setGuestName('');
    setGuestContact('');
  }

  function move(index: number, delta: -1 | 1) {
    setInvitees((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function updateInvitee(index: number, patch: Partial<DraftInvitee>) {
    setInvitees((current) =>
      current.map((invitee, i) =>
        i === index ? { ...invitee, ...patch } : invitee,
      ),
    );
  }

  const preview = useMemo(() => {
    if (invitees.length === 0) return [];
    return simulateCascade(
      invitees.map((invitee, index) => ({
        id: invitee.key,
        position: index,
        groupStage: inviteMode === 'individual' ? index : invitee.groupStage,
        status: 'queued' as const,
        windowMinutes: invitee.windowMinutes,
        sentAt: null,
      })),
      {
        mode: inviteMode === 'individual' ? 'individual' : 'group',
        capacity: capacity ? Number(capacity) : null,
      },
      new Date(),
    );
  }, [invitees, inviteMode, capacity]);

  const canNext = [
    title.trim().length > 0,
    true,
    invitees.length > 0,
    true,
    true,
    true,
  ][step];

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createEvent({
        title,
        description: description.trim() || null,
        locationName: locationName.trim() || null,
        locationAddress: null,
        startsAt,
        endsAt: null,
        capacity: capacity ? Number(capacity) : null,
        inviteMode,
        showInviteList,
        showAccepted,
        showExpired,
        enablePoll,
        pollResolution,
        voteDeadline: null,
        invitees: invitees.map((invitee) => ({
          profileId: invitee.profileId,
          guestName: invitee.profileId ? undefined : invitee.name,
          guestContact: invitee.guestContact,
          groupStage: invitee.groupStage,
          windowMinutes: invitee.windowMinutes,
        })),
      });
    } catch {
      // A successful create redirects via the server action (normal control
      // flow that doesn't land here); only a real failure does. Reset the
      // button and tell the host instead of leaving it stuck on "Creating…".
      setSubmitting(false);
      setSubmitError(
        'Something went wrong creating your plan. Please try again.',
      );
    }
  }

  const stageCount =
    inviteMode === 'group'
      ? Math.max(1, ...invitees.map((i) => i.groupStage + 1))
      : 1;

  return (
    <div className="space-y-5">
      {/* Progress */}
      <ol aria-label="Steps" className="flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div
              className={`h-1.5 rounded-pill transition-colors ${
                i <= step ? 'bg-terracotta' : 'bg-line'
              }`}
              title={label}
            />
          </li>
        ))}
      </ol>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        Step {step + 1} of {STEPS.length} — {STEPS[step]}
      </p>

      {step === 0 && (
        <div className="space-y-4 animate-rise">
          <div className="space-y-1.5">
            <label htmlFor="title" className="text-sm font-medium">What’s the plan?</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Coffee downtown, Game night, Saturday hike…"
              className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="date" className="text-sm font-medium">Date</label>
              <input
                id="date" type="date" value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="time" className="text-sm font-medium">Time</label>
              <input
                id="time" type="time" value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="location" className="text-sm font-medium">
              Where? <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <input
              id="location" value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Café Luna, my place, Miller Park…"
              className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium">
              Details <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <textarea
              id="description" value={description} rows={3}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="capacity" className="text-sm font-medium">
              How many spots? <span className="text-ink-faint font-normal">(leave blank for one-on-one)</span>
            </label>
            <input
              id="capacity" type="number" min={1} value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="1"
              className="w-32 rounded-card border border-line bg-card px-4 py-3 outline-none focus:border-terracotta"
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3 animate-rise">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              onClick={() => setInviteMode(option.mode)}
              aria-pressed={inviteMode === option.mode}
              className={`w-full text-left rounded-card border p-4 transition-all ${
                inviteMode === option.mode
                  ? 'border-terracotta bg-terracotta-soft shadow-lift'
                  : 'border-line bg-card hover:border-ink-faint'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden>{option.emoji}</span>
                <div>
                  <p className="font-medium">{option.title}</p>
                  <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">{option.body}</p>
                </div>
              </div>
            </button>
          ))}

          <Card tone="cream" className="mt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enablePoll}
                onChange={(e) => setEnablePoll(e.target.checked)}
                className="mt-1 size-4 accent-[oklch(60%_0.128_42)]"
              />
              <span>
                <span className="font-medium">Let the group decide what to do 🗳️</span>
                <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
                  Attendees suggest ideas and rank them privately. The best fit
                  wins — no debates, no loudest-voice problem.
                </span>
              </span>
            </label>
            {enablePoll && (
              <div className="mt-3 pl-7 flex flex-wrap gap-2">
                {(
                  [
                    ['host_pick', 'I pick from top ideas'],
                    ['auto', 'Auto-pick the winner'],
                    ['runoff', 'Final runoff vote'],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    selected={pollResolution === value}
                    onClick={() => setPollResolution(value)}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-rise">
          {friends.length === 0 && (
            <Card tone="cream">
              <p className="text-sm text-ink-soft leading-relaxed">
                You haven’t connected with anyone yet — you can still invite
                people as <strong>guests</strong> below. They’ll get a link, no
                account needed.
              </p>
            </Card>
          )}
          <ul className="space-y-2">
            {friends.map((friend) => {
              const selected = invitees.some((i) => i.profileId === friend.id);
              return (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() => toggleFriend(friend)}
                    aria-pressed={selected}
                    className={`w-full flex items-center gap-3 rounded-card border p-3 transition-all ${
                      selected
                        ? 'border-terracotta bg-terracotta-soft'
                        : 'border-line bg-card hover:border-ink-faint'
                    }`}
                  >
                    <Avatar name={friend.name} seed={friend.id} size="sm" />
                    <span className="flex-1 text-left">
                      <span className="font-medium block">{friend.name}</span>
                      <span className="text-xs text-ink-faint">@{friend.handle}</span>
                    </span>
                    <span aria-hidden className={selected ? 'text-terracotta-deep' : 'text-line'}>
                      {selected ? '✓' : '+'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <Card>
            <p className="text-sm font-medium mb-2">Invite a guest by link</p>
            <div className="space-y-2">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Guest name"
                className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
              />
              <div className="flex gap-2">
                <input
                  value={guestContact}
                  onChange={(e) => setGuestContact(e.target.value)}
                  placeholder="Email or phone (optional)"
                  className="flex-1 rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addGuest}>
                  Add
                </Button>
              </div>
            </div>
          </Card>

          {invitees.length > 0 && (
            <p className="text-sm text-ink-soft">
              {invitees.length} {invitees.length === 1 ? 'person' : 'people'} selected
            </p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 animate-rise">
          <Card tone="cream">
            <p className="text-sm leading-relaxed text-ink-soft">
              {inviteMode === 'individual' ? (
                <>Order matters: <strong>#1 gets asked first</strong>. If they
                can’t make it, Switchboard quietly moves on. No one ever sees
                their place in line.</>
              ) : inviteMode === 'group' ? (
                <>Assign each person a <strong>wave</strong>. Wave 1 goes out
                immediately; later waves only go out if spots remain.</>
              ) : (
                <>Everyone is invited at the same time, each with a response window.</>
              )}
            </p>
          </Card>
          <ol className="space-y-2">
            {invitees.map((invitee, index) => (
              <li
                key={invitee.key}
                className="rounded-card border border-line bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  {inviteMode === 'individual' && (
                    <span className="font-display text-lg text-terracotta-deep w-6 text-center">
                      {index + 1}
                    </span>
                  )}
                  <Avatar name={invitee.name} seed={invitee.key} size="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium block truncate">
                      {invitee.name}
                      {!invitee.profileId && (
                        <span className="ml-1.5 text-xs text-gold rounded-pill bg-gold-soft px-1.5 py-0.5">guest</span>
                      )}
                    </span>
                  </span>
                  {inviteMode === 'individual' && (
                    <span className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${invitee.name} up`}
                        className="text-ink-faint hover:text-ink disabled:opacity-25 px-1"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === invitees.length - 1}
                        aria-label={`Move ${invitee.name} down`}
                        className="text-ink-faint hover:text-ink disabled:opacity-25 px-1"
                      >
                        ▼
                      </button>
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex items-center gap-2 flex-wrap pl-9">
                  {inviteMode === 'group' && (
                    <select
                      value={invitee.groupStage}
                      onChange={(e) =>
                        updateInvitee(index, { groupStage: Number(e.target.value) })
                      }
                      aria-label={`Wave for ${invitee.name}`}
                      className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm"
                    >
                      {Array.from({ length: Math.min(stageCount + 1, 5) }, (_, s) => (
                        <option key={s} value={s}>Wave {s + 1}</option>
                      ))}
                    </select>
                  )}
                  <select
                    value={invitee.windowMinutes}
                    onChange={(e) =>
                      updateInvitee(index, { windowMinutes: Number(e.target.value) })
                    }
                    aria-label={`Response window for ${invitee.name}`}
                    className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm"
                  >
                    {WINDOW_CHOICES.map((choice) => (
                      <option key={choice.windowMinutes} value={choice.windowMinutes}>
                        {choice.label} to respond
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-faint">
            💡 Suggested window for this event: <strong>{suggested.label}</strong> —
            based on how soon it starts.
          </p>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3 animate-rise">
          {(
            [
              {
                label: 'Show the invite list',
                hint: 'Attendees can see everyone who was invited.',
                value: showInviteList,
                set: setShowInviteList,
              },
              {
                label: 'Show who’s accepted',
                hint: 'Attendees can see who’s already in.',
                value: showAccepted,
                set: setShowAccepted,
              },
              {
                label: 'Keep expired invitations visible',
                hint: 'People whose window passed can still see the event page.',
                value: showExpired,
                set: setShowExpired,
              },
            ] as const
          ).map((option) => (
            <Card key={option.label}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={option.value}
                  onChange={(e) => option.set(e.target.checked)}
                  className="mt-1 size-4 accent-[oklch(60%_0.128_42)]"
                />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="block text-sm text-ink-soft mt-0.5">{option.hint}</span>
                </span>
              </label>
            </Card>
          ))}
          <p className="text-xs text-ink-faint leading-relaxed px-1">
            Defaults are tuned so a one-on-one coffee feels private and a party
            feels social. Invitees never see their position in the cascade.
          </p>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4 animate-rise">
          <Card lifted>
            <h3 className="font-display text-xl">{title || 'Untitled plan'}</h3>
            <p className="text-sm text-ink-soft mt-1">
              {startsAt
                ? new Intl.DateTimeFormat('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  }).format(new Date(startsAt))
                : 'Time TBD'}
              {locationName ? ` · ${locationName}` : ''}
            </p>
            <p className="text-sm text-ink-faint mt-1">
              {invitees.length} invitee{invitees.length === 1 ? '' : 's'} ·{' '}
              {MODE_OPTIONS.find((o) => o.mode === inviteMode)?.title}
              {capacity ? ` · ${capacity} spots` : ''}
              {enablePoll ? ' · group decides activity' : ''}
            </p>
          </Card>

          {!enablePoll && preview.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                If nobody responds, here’s how invitations will flow:
              </h4>
              <ol className="space-y-1.5">
                {preview.map((entry) => {
                  const invitee = invitees.find((i) => i.key === entry.id);
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 text-sm rounded-card bg-cream px-3.5 py-2.5"
                    >
                      <span className="text-ink-faint" aria-hidden>→</span>
                      <span className="font-medium flex-1">{invitee?.name}</span>
                      <span className="text-ink-faint text-xs">
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        }).format(entry.wouldSendAt)}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-ink-faint mt-2">
                In reality it usually goes much faster — the moment someone
                accepts, the flow stops.
              </p>
            </div>
          )}

          {enablePoll && (
            <Card tone="gold">
              <p className="text-sm leading-relaxed">
                🗳️ This plan starts in <strong>deciding mode</strong> — invitees
                will suggest and rank ideas first. You’ll send the cascade once
                the group settles on what to do.
              </p>
            </Card>
          )}
        </div>
      )}

      {submitError && (
        <p
          role="alert"
          className="rounded-card bg-rose-soft text-rose-deep text-sm p-3"
        >
          {submitError}
        </p>
      )}

      {/* Nav */}
      <div className="flex gap-3 pt-2">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            className="flex-1"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            className="flex-1"
            disabled={submitting}
            onClick={submit}
          >
            {submitting
              ? 'Creating…'
              : enablePoll
                ? 'Create & start deciding'
                : 'Send invitations'}
          </Button>
        )}
      </div>
    </div>
  );
}
