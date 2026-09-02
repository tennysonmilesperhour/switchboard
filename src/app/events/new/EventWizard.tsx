'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  sharedWindow,
  suggestWindow,
  windowForNewInvitee,
  type WindowPace,
} from '@/lib/engine/windows';
import { isEmail } from '@/lib/auth-identity';
import type { RecurrenceKind } from '@/lib/engine/recurrence';
import { simulateCascade } from '@/lib/engine/cascade';
import { previousStep } from '@/lib/wizard-steps';
import { hostSuggestions } from '@/lib/engine/suggestions';
import {
  createEvent,
  lookupInviteeByHandle,
  type CreateEventInput,
} from '@/lib/actions/events';
import { normalizePhoneNumber } from '@/lib/phone';
import type { PlanDraft } from '@/lib/actions/plan';
import type { ImportResult } from '@/lib/actions/import';
import type { InviteMode, EventTheme } from '@/lib/types';
import { resolveTimeZone } from '@/lib/client/time-zone';
import { hasInviteDetails } from '@/lib/event-details';
import {
  resolveContactMatches,
  type ContactCandidate,
  type ContactMatch,
} from '@/lib/actions/connections';

import { BasicsStep } from './steps/BasicsStep';
import { StyleStep } from './steps/StyleStep';
import { PeopleStep } from './steps/PeopleStep';
import { OrderStep } from './steps/OrderStep';
import { VisibilityStep } from './steps/VisibilityStep';
import { ReviewStep } from './steps/ReviewStep';
import { WizardFrame } from './steps/WizardFrame';
import {
  DEFAULT_START_TIME,
  OUTDOOR_HINTS,
  localDateTimeToIso,
  type DraftInvitee,
  type WizardCircle,
  type WizardFriend,
  type WizardHousehold,
  type WizardQuestion,
} from './steps/wizard-types';

export function EventWizard({
  userId,
  friends,
  households = [],
  circles = [],
  initialTitle = '',
  initialDescription = '',
  ritualId = null,
  initialInviteeId = null,
  initialDecide = false,
  initialError = null,
  defaultPace = 'standard',
  upcomingPlanCount = 0,
  capacityGuard = false,
}: {
  userId: string;
  friends: WizardFriend[];
  households?: WizardHousehold[];
  circles?: WizardCircle[];
  initialTitle?: string;
  initialDescription?: string;
  ritualId?: string | null;
  initialInviteeId?: string | null;
  initialDecide?: boolean;
  initialError?: string | null;
  /** Host's tempo, from the opt-in "Tune my defaults" operator setting. */
  defaultPace?: WindowPace;
  /** Plans the host already has in the next week (for the capacity nudge). */
  upcomingPlanCount?: number;
  /** Whether the opt-in "Capacity nudge" operator setting is on. */
  capacityGuard?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Whether a spare history entry is parked behind us for the back gesture to
   * land on. Nothing in the wizard changes the URL, so without one, the phone's
   * back swipe leaves `/events/new` altogether and every field goes with it —
   * which is how "I only wanted to fix the time" turns into starting the plan
   * over. One entry is enough: consuming it steps back, and the effect below
   * parks another for the step after that.
   */
  const backGuard = useRef(false);
  /** Where a back we asked for should land, read once by the popstate handler. */
  const backTarget = useRef<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(initialError);

  // Step 1 - basics
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [locationName, setLocationName] = useState('');
  // Coordinate captured when the host picks a map-recognized place, so the plan
  // lands on the map without a separate "locate" step. Null for free text (the
  // server still best-effort geocodes it on create).
  const [locationPoint, setLocationPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceKind>('none');
  const [customDays, setCustomDays] = useState('14');
  const [capacity, setCapacity] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [wishlistUrl, setWishlistUrl] = useState('');
  const [theme, setTheme] = useState<EventTheme>('default');
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);

  // Step 2 - style
  const [inviteMode, setInviteMode] = useState<InviteMode>('individual');
  // Arriving via the "Help me figure it out" door starts the plan in deciding
  // mode, so the group votes on what to do before invites go out.
  const [enablePoll, setEnablePoll] = useState(initialDecide);
  const [pollResolution, setPollResolution] =
    useState<CreateEventInput['pollResolution']>('host_pick');
  const [suggestDeadline, setSuggestDeadline] = useState('');
  const [voteDeadline, setVoteDeadline] = useState('');

  // Step 3/4 - people & order
  const [invitees, setInvitees] = useState<DraftInvitee[]>(() => {
    const preselected = friends.find((f) => f.id === initialInviteeId);
    if (!preselected) return [];
    return [
      {
        key: preselected.id,
        profileId: preselected.id,
        name: preselected.name,
        groupStage: 0,
        windowMinutes: 24 * 60,
      },
    ];
  });
  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);
  const [resolvingGuest, setResolvingGuest] = useState(false);
  const [contactsBusy, setContactsBusy] = useState(false);
  const [contactMatches, setContactMatches] = useState<ContactMatch[]>([]);
  const [contactsNote, setContactsNote] = useState<string | null>(null);
  // Long friend lists get long; collapse by default so the group chips and
  // guest box below stay reachable without a marathon scroll.
  const [friendsOpen, setFriendsOpen] = useState(friends.length <= 12);

  // Step 5 - visibility
  const [showInviteList, setShowInviteList] = useState(false);
  const [showAccepted, setShowAccepted] = useState(true);
  const [showExpired, setShowExpired] = useState(false);
  const [openTable, setOpenTable] = useState(true);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [parentalApproval, setParentalApproval] = useState(false);

  const startsAt = useMemo(() => {
    if (!date) return null;
    return new Date(`${date}T${time || DEFAULT_START_TIME}`).toISOString();
  }, [date, time]);

  const endsAt = useMemo(() => {
    if (!date || !endTime) return null;
    return new Date(`${date}T${endTime}`).toISOString();
  }, [date, endTime]);

  const suggested = useMemo(
    () =>
      suggestWindow(
        startsAt ? new Date(startsAt) : new Date(),
        new Date(),
        defaultPace,
      ),
    [startsAt, defaultPace],
  );

  // Block scheduling a plan in the past. `minDate` (today, in the visitor's
  // local zone) is set on the client so the native date picker greys out prior
  // days without risking an SSR/client hydration mismatch on the attribute.
  // `startsInPast` also guards the chosen time, catching "today, but an hour
  // that already passed."
  const [minDate, setMinDate] = useState('');
  useEffect(() => {
    // Defer the setState a tick (matching the contacts-support effect below) so
    // it isn't a synchronous set-state-in-effect, and so `min` is empty on the
    // server render and only firms up on the client — no hydration mismatch.
    const timeout = window.setTimeout(() => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      setMinDate(`${yyyy}-${mm}-${dd}`);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  const startsInPast = useMemo(
    () => startsAt !== null && new Date(startsAt).getTime() < new Date().getTime(),
    [startsAt],
  );
  const endsBeforeStart = useMemo(
    () => Boolean(startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)),
    [startsAt, endsAt],
  );

  // Gentle nudge to check the forecast when the plan reads as outdoors. Purely
  // a heuristic on what the host typed — no forecast API involved.
  const looksOutdoor = useMemo(() => {
    const haystack = `${title} ${locationName} ${description}`.toLowerCase();
    return OUTDOOR_HINTS.some((word) => haystack.includes(word));
  }, [title, locationName, description]);

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
          windowMinutes: newInviteeWindow(current),
        },
      ];
    });
  }

  function applyDraft(draft: PlanDraft) {
    setTitle(draft.title);
    if (draft.date) setDate(draft.date);
    if (draft.time) setTime(draft.time);
    if (draft.locationName) {
      setLocationName(draft.locationName);
      setLocationPoint(null);
    }
    if (draft.capacity) setCapacity(String(draft.capacity));
    setInviteMode(draft.mode);
    if (draft.invitees.length > 0) {
      setInvitees(
        draft.invitees.map((friend) => ({
          key: friend.id,
          profileId: friend.id,
          name: friend.name,
          groupStage: 0,
          windowMinutes: suggested.windowMinutes,
        })),
      );
    }
  }

  function applyImport(result: ImportResult) {
    if (result.title) setTitle(result.title);
    if (result.description) setDescription(result.description);
    if (result.date) setDate(result.date);
    if (result.time) setTime(result.time);
    if (result.locationName) {
      setLocationName(result.locationName);
      setLocationPoint(null);
    }
  }

  function toggleGroup(memberIds: string[]) {
    setInvitees((current) => {
      const members = memberIds
        .map((id) => friends.find((f) => f.id === id))
        .filter((f): f is WizardFriend => Boolean(f));
      const allIn =
        members.length > 0 &&
        members.every((m) => current.some((i) => i.profileId === m.id));
      if (allIn) {
        return current.filter(
          (i) => !members.some((m) => m.id === i.profileId),
        );
      }
      const additions = members
        .filter((m) => !current.some((i) => i.profileId === m.id))
        .map((m) => ({
          key: m.id,
          profileId: m.id,
          name: m.name,
          groupStage: 0,
          windowMinutes: newInviteeWindow(current),
        }));
      return [...current, ...additions];
    });
  }

  function toggleHousehold(household: WizardHousehold) {
    toggleGroup(household.memberIds);
  }

  function toggleCircle(circle: WizardCircle) {
    toggleGroup(circle.memberIds);
  }

  function addGuestInvite(name: string, contact: string) {
    const label = name || contact.replace(/^@/, '');
    setInvitees((current) => [
      ...current,
      {
        key: `guest-${label}-${current.length}`,
        profileId: null,
        name: label,
        guestContact: contact || undefined,
        groupStage: 0,
        windowMinutes: newInviteeWindow(current),
      },
    ]);
    setGuestName('');
    setGuestContact('');
  }

  async function addGuest() {
    const name = guestName.trim();
    const contact = guestContact.trim();
    if (!name && !contact) return;
    setGuestError(null);

    const emailLike = isEmail(contact);
    const isPhone = normalizePhoneNumber(contact) !== null;

    // A username (anything in the contact box that isn't an email or phone)
    // must map to a real account. We never silently invite a typo'd handle as
    // an off-platform guest — email and phone are the guest paths.
    if (contact && !emailLike && !isPhone) {
      const handle = contact.replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
        setGuestError('Enter a valid username, email, or phone number.');
        return;
      }
      setResolvingGuest(true);
      try {
        const found = await lookupInviteeByHandle(handle);
        if (!found) {
          setGuestError(`No account with the username @${handle}. Invite them by email or phone instead.`);
          return;
        }
        if (found.id === userId) {
          setGuestError('That’s you - you’re already the host.');
          return;
        }
        setInvitees((current) =>
          current.some((i) => i.profileId === found.id)
            ? current
            : [
                ...current,
                {
                  key: `member-${found.id}`,
                  profileId: found.id,
                  name: found.name,
                  groupStage: 0,
                  windowMinutes: newInviteeWindow(current),
                },
              ],
        );
        setGuestName('');
        setGuestContact('');
      } finally {
        setResolvingGuest(false);
      }
      return;
    }

    // Email / phone / name-only → off-platform guest (link, email, or text).
    addGuestInvite(name, contact);
  }

  // The invite target we'd stage for a matched contact: a real profile if the
  // contact is on Switchboard, otherwise a textable phone/email guest. Matches
  // with neither (name-only, no account) can't be invited, so we skip them.
  function inviteTargetFor(match: ContactMatch) {
    if (match.profile) return { profileId: match.profile.id, contact: null as string | null };
    const contact = match.smsTarget ?? match.identifier ?? null;
    if (!contact) return null;
    return { profileId: null as string | null, contact };
  }

  function isMatchSelected(match: ContactMatch) {
    const target = inviteTargetFor(match);
    if (!target) return false;
    return invitees.some((invitee) =>
      target.profileId
        ? invitee.profileId === target.profileId
        : invitee.profileId === null && invitee.guestContact === target.contact,
    );
  }

  function toggleContactMatch(match: ContactMatch) {
    const target = inviteTargetFor(match);
    if (!target) return;
    setInvitees((current) => {
      if (target.profileId) {
        if (current.some((i) => i.profileId === target.profileId)) {
          return current.filter((i) => i.profileId !== target.profileId);
        }
        return [
          ...current,
          {
            key: target.profileId,
            profileId: target.profileId,
            name: match.profile?.name ?? match.name,
            groupStage: 0,
            windowMinutes: newInviteeWindow(current),
          },
        ];
      }
      const existing = current.find(
        (i) => i.profileId === null && i.guestContact === target.contact,
      );
      if (existing) {
        return current.filter((i) => i.key !== existing.key);
      }
      return [
        ...current,
        {
          key: `contact-${target.contact}`,
          profileId: null,
          name: match.name || target.contact!,
          guestContact: target.contact!,
          groupStage: 0,
          windowMinutes: newInviteeWindow(current),
        },
      ];
    });
  }

  async function matchContactsFromDevice(contacts: ContactCandidate[]) {
    setContactsBusy(true);
    setSubmitError(null);
    setContactsNote(null);
    try {
      const matches = await resolveContactMatches(contacts);
      // Drop yourself and anyone with no way to be invited (no account and no
      // textable number); on-Switchboard matches float to the top.
      const invitable = matches
        .filter((match) => match.connectionStatus !== 'self')
        .filter((match) => Boolean(inviteTargetFor(match)))
        .sort((a, b) => Number(Boolean(b.profile)) - Number(Boolean(a.profile)));
      setContactMatches(invitable);
      const onApp = invitable.filter((match) => match.profile).length;
      setContactsNote(
        invitable.length === 0
          ? 'None of those contacts can be invited yet - no matching accounts or numbers.'
          : onApp === 0
            ? `${invitable.length} ${invitable.length === 1 ? 'contact' : 'contacts'} can be invited by text.`
            : `${onApp} on Switchboard${
                invitable.length - onApp > 0 ? `, ${invitable.length - onApp} by text` : ''
              }. Tap to add them.`,
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Could not open contacts on this device.',
      );
    } finally {
      setContactsBusy(false);
    }
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

  /** The window everyone shares, or null when the rows disagree ("Mixed"). */
  const commonWindow = useMemo(
    () => sharedWindow(invitees.map((i) => i.windowMinutes)),
    [invitees],
  );

  /**
   * The window to give someone just added. Reads `current` from inside the
   * `setInvitees` updater rather than the closed-over `invitees`, which may be
   * a render behind when several people are added in one go.
   */
  function newInviteeWindow(current: DraftInvitee[]): number {
    return windowForNewInvitee(
      current.map((i) => i.windowMinutes),
      suggested.windowMinutes,
    );
  }

  /** The "select all" from the feedback: one window, everybody. */
  function setWindowForEveryone(minutes: number) {
    setInvitees((current) =>
      current.map((invitee) => ({ ...invitee, windowMinutes: minutes })),
    );
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

  const suggestions = useMemo(
    () =>
      hostSuggestions({
        startsAt: startsAt ? new Date(startsAt) : null,
        now: new Date(),
        inviteMode,
        invitees: invitees.map((i) => ({
          windowMinutes: i.windowMinutes,
          groupStage: i.groupStage,
        })),
        capacity: capacity ? Number(capacity) : null,
        hasLocation: locationName.trim().length > 0,
        enablePoll,
        upcomingPlanCount,
        capacityGuard,
      }),
    [
      startsAt,
      inviteMode,
      invitees,
      capacity,
      locationName,
      enablePoll,
      upcomingPlanCount,
      capacityGuard,
    ],
  );

  const selectedFriendCount = invitees.filter((i) => i.profileId).length;

  // Per-step: does this step have everything it needs? The Next button reads
  // its own entry; the progress bar reads the whole array to decide which steps
  // can be jumped to. One source, so the two can never disagree about whether
  // Basics is finished.
  const stepComplete = useMemo(
    () => [
      title.trim().length > 0 &&
        hasInviteDetails(locationName, description) &&
        !startsInPast &&
        !endsBeforeStart,
      true,
      invitees.length > 0,
      true,
      true,
      true,
    ],
    [title, locationName, description, startsInPast, endsBeforeStart, invitees.length],
  );
  useEffect(() => {
    // Nothing to protect on the first step: back should leave, as it always
    // would, and the browser does that on its own.
    if (step === 0 || backGuard.current) return;
    window.history.pushState(window.history.state, '');
    backGuard.current = true;
  }, [step]);

  useEffect(() => {
    const onPopState = () => {
      backGuard.current = false;
      // A gesture with no step named behind it is the browser's own back: one
      // step. Anything else is a jump the wizard asked for, and said where to.
      const asked = backTarget.current;
      backTarget.current = null;
      setStep((current) => (asked === null ? previousStep(current) : asked));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /**
   * Move to a step. Going back spends the parked history entry rather than
   * leaving it behind, so the back gesture and the wizard's own controls stay
   * one mechanism — otherwise a swipe after a Back tap would step back twice.
   */
  const goToStep = useCallback(
    (target: number) => {
      if (target < step && backGuard.current) {
        backTarget.current = target;
        window.history.back();
        return;
      }
      setStep(target);
    },
    [step],
  );

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createEvent({
        title,
        description: description.trim() || null,
        locationName: locationName.trim() || null,
        locationAddress: null,
        latitude: locationPoint?.lat ?? null,
        longitude: locationPoint?.lng ?? null,
        startsAt,
        endsAt,
        // The zone `startsAt` was computed in, so server-side renders (link
        // unfurls, guest RSVP pages) show the host's intended local time.
        timeZone: resolveTimeZone(),
        capacity: capacity ? Number(capacity) : null,
        inviteMode,
        openTable,
        showInviteList,
        showAccepted,
        showExpired,
        enablePoll,
        pollResolution,
        suggestDeadline: enablePoll ? localDateTimeToIso(suggestDeadline) : null,
        voteDeadline: enablePoll ? localDateTimeToIso(voteDeadline) : null,
        remindersEnabled,
        parentalApproval,
        coverUrl: coverUrl.trim() || null,
        wishlistUrl: wishlistUrl.trim() || null,
        theme,
        recurrence,
        recurrenceIntervalDays:
          recurrence === 'custom' ? Number(customDays) || null : null,
        questions: questions
          .map((q) => {
            const options = q.options
              .map((o) => o.trim())
              .filter((o) => o.length > 0);
            // Only keep it a choice question if it has at least two real
            // options; otherwise it falls back to free text (the server
            // enforces the same rule).
            const isChoice = q.kind === 'choice' && options.length >= 2;
            return {
              prompt: q.prompt.trim(),
              required: q.required,
              kind: (isChoice ? 'choice' : 'text') as 'text' | 'choice',
              options: isChoice ? options : [],
            };
          })
          .filter((q) => q.prompt.length > 0),
        ritualId,
        invitees: invitees.map((invitee) => ({
          profileId: invitee.profileId,
          guestName: invitee.profileId ? undefined : invitee.name,
          guestContact: invitee.guestContact,
          groupStage: invitee.groupStage,
          windowMinutes: invitee.windowMinutes,
        })),
      });
      if (result.ok && result.eventId) {
        const suffix = result.warning ? '?delivery=attention' : '';
        window.location.assign(`/events/${result.eventId}${suffix}`);
        return;
      }
      setSubmitting(false);
      setSubmitError(
        result.error ?? 'Something went wrong creating your plan. Please try again.',
      );
    } catch {
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
    <WizardFrame
      step={step} stepComplete={stepComplete} goToStep={goToStep}
      submitError={submitError} submitting={submitting} enablePoll={enablePoll}
      submit={submit}
    >
      {step === 0 && (
        <BasicsStep
          userId={userId}
          applyDraft={applyDraft}
          applyImport={applyImport}
          title={title} setTitle={setTitle}
          date={date} setDate={setDate}
          minDate={minDate}
          time={time} setTime={setTime}
          endTime={endTime} setEndTime={setEndTime}
          startsInPast={startsInPast}
          endsBeforeStart={endsBeforeStart}
          recurrence={recurrence} setRecurrence={setRecurrence}
          customDays={customDays} setCustomDays={setCustomDays}
          locationName={locationName} setLocationName={setLocationName}
          locationPoint={locationPoint} setLocationPoint={setLocationPoint}
          description={description} setDescription={setDescription}
          capacity={capacity} setCapacity={setCapacity}
          coverUrl={coverUrl} setCoverUrl={setCoverUrl}
          wishlistUrl={wishlistUrl} setWishlistUrl={setWishlistUrl}
          questions={questions} setQuestions={setQuestions}
        />
      )}

      {step === 1 && (
        <StyleStep
          inviteMode={inviteMode} setInviteMode={setInviteMode}
          enablePoll={enablePoll} setEnablePoll={setEnablePoll}
          pollResolution={pollResolution} setPollResolution={setPollResolution}
          suggestDeadline={suggestDeadline} setSuggestDeadline={setSuggestDeadline}
          voteDeadline={voteDeadline} setVoteDeadline={setVoteDeadline}
          minDate={minDate}
          remindersEnabled={remindersEnabled} setRemindersEnabled={setRemindersEnabled}
          theme={theme} setTheme={setTheme}
        />
      )}

      {step === 2 && (
        <PeopleStep
          households={households}
          circles={circles}
          friends={friends}
          invitees={invitees}
          toggleHousehold={toggleHousehold}
          toggleCircle={toggleCircle}
          toggleFriend={toggleFriend}
          friendsOpen={friendsOpen}
          setFriendsOpen={setFriendsOpen}
          selectedFriendCount={selectedFriendCount}
          guestName={guestName} setGuestName={setGuestName}
          guestContact={guestContact} setGuestContact={setGuestContact}
          guestError={guestError} setGuestError={setGuestError}
          resolvingGuest={resolvingGuest}
          addGuest={addGuest}
          matchContactsFromDevice={matchContactsFromDevice}
          contactsBusy={contactsBusy}
          contactsNote={contactsNote}
          contactMatches={contactMatches}
          isMatchSelected={isMatchSelected}
          toggleContactMatch={toggleContactMatch}
        />
      )}

      {step === 3 && (
        <OrderStep
          inviteMode={inviteMode}
          invitees={invitees}
          commonWindow={commonWindow}
          setWindowForEveryone={setWindowForEveryone}
          suggested={suggested}
          move={move}
          updateInvitee={updateInvitee}
          stageCount={stageCount}
        />
      )}

      {step === 4 && (
        <VisibilityStep
          showInviteList={showInviteList} setShowInviteList={setShowInviteList}
          showAccepted={showAccepted} setShowAccepted={setShowAccepted}
          showExpired={showExpired} setShowExpired={setShowExpired}
          remindersEnabled={remindersEnabled} setRemindersEnabled={setRemindersEnabled}
          parentalApproval={parentalApproval} setParentalApproval={setParentalApproval}
          capacity={capacity}
          openTable={openTable} setOpenTable={setOpenTable}
        />
      )}

      {step === 5 && (
        <ReviewStep
          title={title} startsAt={startsAt} endsAt={endsAt}
          locationName={locationName} invitees={invitees} inviteMode={inviteMode}
          capacity={capacity} enablePoll={enablePoll}
          recurrence={recurrence} customDays={customDays}
          suggestions={suggestions} looksOutdoor={looksOutdoor}
          preview={preview}
        />
      )}
    </WizardFrame>
  );
}
