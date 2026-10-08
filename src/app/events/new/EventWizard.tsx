'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { suggestWindow, type WindowPace } from '@/lib/engine/windows';
import type { RecurrenceKind } from '@/lib/engine/recurrence';
import { simulateCascade } from '@/lib/engine/cascade';
import { previousStep } from '@/lib/wizard-steps';
import { hostSuggestions } from '@/lib/engine/suggestions';
import { createEvent, type CreateEventInput } from '@/lib/actions/events';
import type { PlanDraft } from '@/lib/actions/plan';
import type { ImportResult } from '@/lib/actions/import';
import type { InviteMode, EventTheme } from '@/lib/types';
import { resolveTimeZone } from '@/lib/client/time-zone';
import { hasInviteDetails } from '@/lib/event-details';
import { planEnd } from '@/lib/plan-time';
import { capacityProblem } from '@/lib/plan-capacity';
import type { ErrorCode } from '@/lib/errors';

import { useInviteeDraft } from './use-invitee-draft';
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
  normalizeWizardQuestions,
  orderStepNeeded,
  wizardSteps,
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
  // Beside a failed publish, so "it wouldn't send" is a diagnosis. Validation
  // refusals ("Add at least one person") carry none.
  const [submitCode, setSubmitCode] = useState<ErrorCode | null>(null);

  // Basics
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

  // Invites step. Everyone at once is the default because it is what most
  // plans mean by "invite"; the chain is opt-in, chosen once the host can see
  // who is on the list and how many spots there are.
  const [inviteMode, setInviteMode] = useState<InviteMode>('all_at_once');
  // Arriving via the "Help me figure it out" door starts the plan in deciding
  // mode, so the group votes on what to do before invites go out.
  const [enablePoll, setEnablePoll] = useState(initialDecide);
  const [pollResolution, setPollResolution] =
    useState<CreateEventInput['pollResolution']>('host_pick');
  const [suggestDeadline, setSuggestDeadline] = useState('');
  const [voteDeadline, setVoteDeadline] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>([]);

  // Privacy
  const [showInviteList, setShowInviteList] = useState(false);
  const [showAccepted, setShowAccepted] = useState(true);
  const [showExpired, setShowExpired] = useState(false);
  const [openTable, setOpenTable] = useState(true);
  const [broadcastNearby, setBroadcastNearby] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [parentalApproval, setParentalApproval] = useState(false);

  const startsAt = useMemo(() => {
    if (!date) return null;
    return new Date(`${date}T${time || DEFAULT_START_TIME}`).toISOString();
  }, [date, time]);

  // An end at or before the start means the next morning: see `planEnd`.
  const end = useMemo(
    () => planEnd(date, time || DEFAULT_START_TIME, endTime),
    [date, time, endTime],
  );
  const endsAt = end.endsAt;

  const suggested = useMemo(
    () =>
      suggestWindow(
        startsAt ? new Date(startsAt) : new Date(),
        new Date(),
        defaultPace,
      ),
    [startsAt, defaultPace],
  );

  /**
   * Who is coming, and every way that list can change. The rules there are
   * involved enough to have their own home — see `use-invitee-draft`.
   */
  const people = useInviteeDraft({
    userId,
    friends,
    initialInviteeId,
    suggestedWindowMinutes: suggested.windowMinutes,
    onError: setSubmitError,
  });
  const { invitees, duplicates } = people;


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
  const endsBeforeStart = end.sameAsStart;
  // The number the host typed, checked here rather than left to the database
  // CHECK, which turned "0" or "2.5" into "Something went wrong publishing your
  // plan" - an operator error for a typo, with nothing saying which field.
  const capacityError = capacityProblem(capacity);

  // Gentle nudge to check the forecast when the plan reads as outdoors. Purely
  // a heuristic on what the host typed — no forecast API involved.
  const looksOutdoor = useMemo(() => {
    const haystack = `${title} ${locationName} ${description}`.toLowerCase();
    return OUTDOOR_HINTS.some((word) => haystack.includes(word));
  }, [title, locationName, description]);

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
      people.setInvitees(
        draft.invitees.map((friend: { id: string; name: string }) => ({
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

  // The steps this plan goes through. "Set the order" only appears when there
  // is an order to set; the response window it would have asked for moves to
  // the invites step. Both inputs are decided on earlier steps, so the current
  // index never shifts underneath the host.
  const steps = useMemo(
    () => wizardSteps(inviteMode, invitees.length),
    [inviteMode, invitees.length],
  );

  // Per-step: does this step have everything it needs? The Next button reads
  // its own entry; the progress bar reads the whole array to decide which steps
  // can be jumped to. One source, so the two can never disagree about whether
  // Basics is finished.
  /**
   * Change the rhythm, and stay on the step you were reading.
   *
   * The step list itself depends on the mode: "Set the order" exists for a
   * chain and not for everyone-at-once, so switching from the Review screen
   * slides a whole step in ahead of it. Holding the index still would land the
   * host on Privacy, a screen she had already passed, with no explanation. The
   * step is therefore re-found BY KEY rather than by number.
   */
  const chooseInviteMode = useCallback(
    (mode: InviteMode) => {
      const here = steps[Math.min(step, steps.length - 1)];
      const after = wizardSteps(mode, invitees.length);
      setInviteMode(mode);
      const landing = after.indexOf(here);
      if (landing !== -1) setStep(landing);
    },
    [steps, step, invitees.length],
  );

  const stepComplete = useMemo(
    () =>
      steps.map((key) => {
        if (key === 'basics') {
          return (
            title.trim().length > 0 &&
            hasInviteDetails(locationName, description) &&
            !startsInPast &&
            !endsBeforeStart &&
            capacityError === null
          );
        }
        if (key === 'people') return invitees.length > 0;
        return true;
      }),
    [
      steps,
      title,
      locationName,
      description,
      startsInPast,
      endsBeforeStart,
      capacityError,
      invitees.length,
    ],
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
    setSubmitCode(null);
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
        broadcastNearby: openTable && broadcastNearby,
        showInviteList,
        showAccepted,
        showExpired,
        enablePoll,
        pollResolution,
        suggestDeadline: enablePoll ? localDateTimeToIso(suggestDeadline) : null,
        voteDeadline: enablePoll ? localDateTimeToIso(voteDeadline) : null,
        pollOptions: enablePoll ? pollOptions : undefined,
        remindersEnabled,
        parentalApproval,
        coverUrl: coverUrl.trim() || null,
        wishlistUrl: wishlistUrl.trim() || null,
        theme,
        recurrence,
        recurrenceIntervalDays:
          recurrence === 'custom' ? Number(customDays) || null : null,
        questions: normalizeWizardQuestions(questions),
        ritualId,
        invitees: invitees.map((invitee) => ({
          profileId: invitee.profileId,
          guestName: invitee.profileId ? undefined : invitee.name,
          guestContact: invitee.guestContact,
          // A stage chosen for waves must not survive a switch to "everyone at
          // once": the database would queue that person behind a wave that never
          // runs.
          groupStage: inviteMode === 'all_at_once' ? 0 : invitee.groupStage,
          windowMinutes: invitee.windowMinutes,
        })),
      });
      if (result.ok && result.eventId) {
        const suffix = result.warning ? '?delivery=attention' : '';
        // A full load on purpose: the new plan changes the shell around the
        // page too (Calendar, the rooms list, the bell), and a client
        // transition would keep those from before it existed.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/events/${result.eventId}${suffix}`);
        return;
      }
      setSubmitting(false);
      setSubmitError(
        result.error ?? 'Something went wrong creating your plan. Please try again.',
      );
      setSubmitCode(result.code ?? null);
    } catch {
      // A lost response can't say whether the publish committed, so don't
      // claim it didn't: a blind retry would invite everyone twice.
      setSubmitting(false);
      setSubmitError(
        'We couldn’t confirm your plan was created. Check your calendar before sending it again.',
      );
      setSubmitCode('SB-PLAN-CREATE');
    }
  }

  /**
   * The step actually on screen.
   *
   * `step` can sit past the end of the list for a render: removing the last
   * invitee from Review drops "Set the order" out of `steps` underneath it.
   * Clamping here rather than correcting the state in an effect means there is
   * never a frame with nothing rendered, and the back-gesture bookkeeping —
   * which counts steps, not list lengths — is left alone.
   */
  const activeStep = Math.min(step, steps.length - 1);
  const current = steps[activeStep];

  return (
    <WizardFrame
      steps={steps}
      step={activeStep} stepComplete={stepComplete} goToStep={goToStep}
      submitError={submitError} submitCode={submitCode} submitting={submitting} enablePoll={enablePoll}
      submit={submit}
    >
      {current === 'basics' && (
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
          endsNextDay={end.nextDay}
          capacityError={capacityError}
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

      {current === 'style' && (
        <StyleStep
          inviteMode={inviteMode} setInviteMode={chooseInviteMode}
          enablePoll={enablePoll} setEnablePoll={setEnablePoll}
          pollResolution={pollResolution} setPollResolution={setPollResolution}
          suggestDeadline={suggestDeadline} setSuggestDeadline={setSuggestDeadline}
          voteDeadline={voteDeadline} setVoteDeadline={setVoteDeadline}
          pollOptions={pollOptions} setPollOptions={setPollOptions}
          minDate={minDate}
          remindersEnabled={remindersEnabled} setRemindersEnabled={setRemindersEnabled}
          theme={theme} setTheme={setTheme}
          inviteeCount={invitees.length}
          showWindow={!orderStepNeeded(inviteMode, invitees.length)}
          commonWindow={people.commonWindow}
          setWindowForEveryone={people.setWindowForEveryone}
          suggested={suggested}
        />
      )}

      {current === 'people' && (
        <PeopleStep
          households={households}
          circles={circles}
          friends={friends}
          invitees={invitees}
          toggleHousehold={people.toggleHousehold}
          toggleCircle={people.toggleCircle}
          toggleFriend={people.toggleFriend}
          friendsOpen={people.friendsOpen}
          setFriendsOpen={people.setFriendsOpen}
          selectedFriendCount={people.selectedFriendCount}
          guestName={people.guestName} setGuestName={people.setGuestName}
          guestContact={people.guestContact} setGuestContact={people.setGuestContact}
          guestError={people.guestError} setGuestError={people.setGuestError}
          resolvingGuest={people.resolvingGuest}
          addGuest={people.addGuest}
          matchContactsFromDevice={people.matchContactsFromDevice}
          contactsBusy={people.contactsBusy}
          contactsNote={people.contactsNote}
          contactMatches={people.contactMatches}
          isMatchSelected={people.isMatchSelected}
          toggleContactMatch={people.toggleContactMatch}
        />
      )}

      {current === 'order' && (
        <OrderStep
          inviteMode={inviteMode}
          invitees={invitees}
          commonWindow={people.commonWindow}
          setWindowForEveryone={people.setWindowForEveryone}
          suggested={suggested}
          moveInvitee={people.moveInvitee}
          removeInvitee={people.removeInvitee}
          updateInvitee={people.updateInvitee}
        />
      )}

      {current === 'visibility' && (
        <VisibilityStep
          showInviteList={showInviteList} setShowInviteList={setShowInviteList}
          showAccepted={showAccepted} setShowAccepted={setShowAccepted}
          showExpired={showExpired} setShowExpired={setShowExpired}
          remindersEnabled={remindersEnabled} setRemindersEnabled={setRemindersEnabled}
          parentalApproval={parentalApproval} setParentalApproval={setParentalApproval}
          capacity={capacity}
          openTable={openTable} setOpenTable={setOpenTable}
          broadcastNearby={broadcastNearby} setBroadcastNearby={setBroadcastNearby}
        />
      )}

      {current === 'review' && (
        <ReviewStep
          title={title} startsAt={startsAt} endsAt={endsAt}
          locationName={locationName} invitees={invitees} inviteMode={inviteMode}
          capacity={capacity} enablePoll={enablePoll}
          recurrence={recurrence} customDays={customDays}
          suggestions={suggestions} looksOutdoor={looksOutdoor}
          preview={preview}
          moveInvitee={people.moveInvitee}
          removeInvitee={people.removeInvitee}
          setInviteMode={chooseInviteMode}
          duplicates={duplicates}
          keepBothDuplicates={people.keepBothDuplicates}
        />
      )}
    </WizardFrame>
  );
}
