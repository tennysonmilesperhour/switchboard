'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ImageInput } from '@/components/ui/ImageInput';
import { TimeSelect } from '@/components/ui/TimeSelect';
import {
  sharedWindow,
  suggestWindow,
  windowForNewInvitee,
  WINDOW_CHOICES,
  type WindowPace,
} from '@/lib/engine/windows';
import { isEmail } from '@/lib/auth-identity';
import {
  RECURRENCE_CHOICES,
  recurrenceLabel,
  type RecurrenceKind,
} from '@/lib/engine/recurrence';
import { simulateCascade } from '@/lib/engine/cascade';
import { hostSuggestions } from '@/lib/engine/suggestions';
import {
  createEvent,
  lookupInviteeByHandle,
  type CreateEventInput,
} from '@/lib/actions/events';
import { normalizePhoneNumber } from '@/lib/phone';
import { DescribePlan } from '@/components/events/DescribePlan';
import { HostSuggestions } from '@/components/events/HostSuggestions';
import { ImportFromLink } from '@/components/events/ImportFromLink';
import { PlaceSearchInput } from '@/components/events/PlaceSearchInput';
import type { PlanDraft } from '@/lib/actions/plan';
import type { ImportResult } from '@/lib/actions/import';
import type { InviteMode, EventTheme } from '@/lib/types';
import { EVENT_THEMES } from '@/lib/themes';
import { ContactImportControls } from '@/components/ContactImportControls';
import { resolveTimeZone } from '@/lib/client/time-zone';
import { hasInviteDetails } from '@/lib/event-details';
import {
  resolveContactMatches,
  type ContactCandidate,
  type ContactMatch,
} from '@/lib/actions/connections';

export interface WizardFriend {
  id: string;
  name: string;
  handle: string;
}

export interface WizardHousehold {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
}

export interface WizardCircle {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
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

// Words that suggest a plan happens outdoors, used only to nudge the host to
// glance at the forecast.
const OUTDOOR_HINTS = [
  'hike', 'hiking', 'walk', 'park', 'picnic', 'beach', 'trail', 'camp',
  'bike', 'cycling', 'garden', 'outdoor', 'outside', 'bbq', 'barbecue',
  'kayak', 'climb', 'ski', 'lake', 'river', 'patio', 'rooftop', 'festival',
];

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
    body: 'Invite groups in stages. Later waves only go out if spots remain - events fill naturally without overbooking.',
  },
  {
    mode: 'all_at_once',
    emoji: '📣',
    title: 'Everyone at once',
    body: 'A classic invitation to your whole list, with a response window.',
  },
];

// Bold, confident heading per step. Visual copy only, not tied to logic.
const STEP_META: Array<{ heading: string; sub: string }> = [
  {
    heading: 'I want to...',
    sub: 'Name the plan. A few words is plenty, add the rest below.',
  },
  {
    heading: 'How should invites go out?',
    sub: 'Pick the rhythm that fits this plan.',
  },
  {
    heading: 'Who is coming?',
    sub: 'Tap friends, pull matches from your contacts, or invite by username, email, or phone.',
  },
  {
    heading: 'Set the order',
    sub: 'Decide who hears about it first.',
  },
  {
    heading: 'Who sees what',
    sub: 'Tune the privacy for this plan.',
  },
  {
    heading: 'Ready to send',
    sub: 'Give it one last look before it goes out.',
  },
];

// Shared field styling for the new bold, roomy input language.
const FIELD =
  'w-full rounded-card border border-line bg-card px-4 py-3 text-[15px] text-ink outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft';
const FIELD_LABEL = 'text-sm font-semibold text-ink';

// Where the start-time picker opens when the host hasn't said otherwise. It was
// always 6pm — the field looked blank but a plan created from it started at
// 18:00 — so showing it is the honest version of what already happened, and it
// saves an evening plan (most of them) a long scroll from midnight.
const DEFAULT_START_TIME = '18:00';

// Custom response-window support: a window is any positive number of minutes,
// but we let the host enter it in whichever unit reads naturally.
type WindowUnit = 'minutes' | 'hours' | 'days';
const UNIT_FACTORS: Record<WindowUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};
function splitWindow(minutes: number): { amount: number; unit: WindowUnit } {
  if (minutes % 1440 === 0) return { amount: minutes / 1440, unit: 'days' };
  if (minutes % 60 === 0) return { amount: minutes / 60, unit: 'hours' };
  return { amount: minutes, unit: 'minutes' };
}

function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

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
  const [questions, setQuestions] = useState<
    Array<{
      prompt: string;
      required: boolean;
      kind: 'text' | 'choice';
      options: string[];
    }>
  >([]);

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

  const canNext = [
    title.trim().length > 0 &&
      hasInviteDetails(locationName, description) &&
      !startsInPast &&
      !endsBeforeStart,
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
    <div className="space-y-6">
      {/* Progress */}
      <ol aria-label="Steps" className="flex items-center gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div
              className={`h-2 rounded-pill transition-all duration-300 ${
                i < step
                  ? 'bg-terracotta'
                  : i === step
                    ? 'bg-brand-gradient'
                    : 'bg-line'
              }`}
              title={label}
            />
          </li>
        ))}
      </ol>

      <header key={step} className="animate-rise">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2
          className={`mt-2 tracking-tight text-ink ${
            step === 0
              ? 'text-[2.5rem] leading-[1.05] font-black'
              : 'text-[1.75rem] leading-tight font-extrabold'
          }`}
        >
          {STEP_META[step].heading}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          {STEP_META[step].sub}
        </p>
      </header>

      {step === 0 && (
        <div className="space-y-4 animate-rise">
          <DescribePlan onDraft={applyDraft} />
          <ImportFromLink onImport={applyImport} />
          <div className="space-y-1.5">
            <label htmlFor="title" className="sr-only">What is the plan?</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Coffee downtown, Game night, Saturday hike…"
              className="w-full rounded-card border-2 border-line bg-card px-5 py-4 text-xl font-semibold text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-faint focus:border-terracotta focus:ring-4 focus:ring-terracotta-soft"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 min-w-0">
              <label htmlFor="date" className={FIELD_LABEL}>Date</label>
              <input
                id="date" type="date" value={date}
                min={minDate || undefined}
                onChange={(e) => setDate(e.target.value)}
                className={`${FIELD} min-w-0 appearance-none [color-scheme:light]`}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <label htmlFor="time" className={FIELD_LABEL}>Start</label>
              <TimeSelect
                id="time"
                value={time}
                onChange={setTime}
                className={`${FIELD} min-w-0 [color-scheme:light]`}
              />
            </div>
            <div className="space-y-1.5 min-w-0 sm:col-span-2">
              <label htmlFor="endTime" className={FIELD_LABEL}>
                Ends <span className="font-normal text-ink-faint">(optional)</span>
              </label>
              <TimeSelect
                id="endTime"
                value={endTime}
                onChange={setEndTime}
                emptyLabel="No end time"
                className={`${FIELD} min-w-0 [color-scheme:light]`}
              />
            </div>
          </div>
          {startsInPast && (
            <p role="alert" className="text-sm font-medium text-rose-deep">
              That date and time have already passed. Pick a moment in the future.
            </p>
          )}
          {endsBeforeStart && (
            <p role="alert" className="text-sm font-medium text-rose-deep">
              End time should be after the start time.
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="recurrence" className={FIELD_LABEL}>
              Repeats?
            </label>
            <div className="flex gap-2">
              <select
                id="recurrence"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceKind)}
                className={`${FIELD} flex-1`}
              >
                {RECURRENCE_CHOICES.map((choice) => (
                  <option key={choice.kind} value={choice.kind}>
                    {choice.label}
                  </option>
                ))}
              </select>
              {recurrence === 'custom' && (
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm text-ink-soft">every</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    aria-label="Repeat every how many days"
                    className={`${FIELD} w-20`}
                  />
                  <span className="text-sm text-ink-soft">days</span>
                </span>
              )}
            </div>
            {recurrence !== 'none' && (
              <p className="text-xs text-ink-faint">
                🔁 We’ll tag this as a standing plan. When it’s behind you, one
                tap gathers the same crew for the next one.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="location" className={FIELD_LABEL}>
              Where?
            </label>
            <PlaceSearchInput
              id="location"
              value={locationName}
              onChange={setLocationName}
              onPointChange={setLocationPoint}
              pinned={locationPoint !== null}
              placeholder="Café Luna, my place, Miller Park…"
              className={FIELD}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="description" className={FIELD_LABEL}>
              Details
            </label>
            <textarea
              id="description" value={description} rows={3}
              onChange={(e) => setDescription(e.target.value)}
              className={`${FIELD} resize-none`}
            />
          </div>
          <p
            className={`text-xs ${
              hasInviteDetails(locationName, description)
                ? 'text-ink-faint'
                : 'font-semibold text-terracotta-deep'
            }`}
          >
            Add at least a location or a short detail so people know what
            they’re responding to.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="capacity" className={FIELD_LABEL}>
              How many spots? <span className="font-normal text-ink-faint">(leave blank for one-on-one)</span>
            </label>
            <input
              id="capacity" type="number" min={1} value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="1"
              className={`${FIELD} w-36`}
            />
          </div>
          <div className="space-y-1.5">
            <p className={FIELD_LABEL}>
              Cover image <span className="font-normal text-ink-faint">(optional)</span>
            </p>
            <ImageInput
              userId={userId}
              value={coverUrl}
              onChange={setCoverUrl}
              pathPrefix="event-cover"
              label="cover image"
              aspect="video"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="wishlist" className={FIELD_LABEL}>
              Wishlist or registry link <span className="font-normal text-ink-faint">(optional)</span>
            </label>
            <input
              id="wishlist" type="url" value={wishlistUrl}
              onChange={(e) => setWishlistUrl(e.target.value)}
              placeholder="https://…"
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <p className={FIELD_LABEL}>
              Questions for guests <span className="font-normal text-ink-faint">(optional)</span>
            </p>
            <p className="text-xs text-ink-faint -mt-0.5">
              Asked when someone accepts. Only you see the answers.
            </p>
            {questions.map((question, index) => {
              const updateQuestion = (
                patch: Partial<(typeof questions)[number]>,
              ) =>
                setQuestions((current) =>
                  current.map((q, i) => (i === index ? { ...q, ...patch } : q)),
                );
              return (
                <div
                  key={index}
                  className="space-y-2 rounded-card border border-line bg-paper p-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={question.prompt}
                      onChange={(e) => updateQuestion({ prompt: e.target.value })}
                      placeholder="Dietary needs? What are you bringing?"
                      aria-label={`Question ${index + 1}`}
                      className="flex-1 rounded-card border border-line bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft"
                    />
                    <button
                      type="button"
                      aria-label={`Remove question ${index + 1}`}
                      onClick={() =>
                        setQuestions((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                      className="text-ink-faint hover:text-rose-deep px-1"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="inline-flex rounded-pill border border-line p-0.5 text-xs font-semibold">
                      {(['text', 'choice'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          aria-pressed={question.kind === kind}
                          onClick={() =>
                            updateQuestion({
                              kind,
                              // Seed two blank options the first time a question
                              // becomes multiple choice.
                              options:
                                kind === 'choice' && question.options.length === 0
                                  ? ['', '']
                                  : question.options,
                            })
                          }
                          className={`rounded-pill px-2.5 py-1 transition-colors ${
                            question.kind === kind
                              ? 'bg-terracotta text-white'
                              : 'text-ink-soft'
                          }`}
                        >
                          {kind === 'text' ? 'Text' : 'Multiple choice'}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-ink-soft whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(e) =>
                          updateQuestion({ required: e.target.checked })
                        }
                        className="size-3.5 accent-terracotta"
                      />
                      Required
                    </label>
                  </div>
                  {question.kind === 'choice' && (
                    <div className="space-y-1.5">
                      {question.options.map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          className="flex items-center gap-2"
                        >
                          <span aria-hidden className="text-ink-faint text-sm">
                            ○
                          </span>
                          <input
                            value={option}
                            onChange={(e) =>
                              updateQuestion({
                                options: question.options.map((o, oi) =>
                                  oi === optionIndex ? e.target.value : o,
                                ),
                              })
                            }
                            placeholder={`Option ${optionIndex + 1}`}
                            aria-label={`Question ${index + 1} option ${optionIndex + 1}`}
                            className="flex-1 rounded-card border border-line bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft"
                          />
                          {question.options.length > 2 && (
                            <button
                              type="button"
                              aria-label={`Remove option ${optionIndex + 1}`}
                              onClick={() =>
                                updateQuestion({
                                  options: question.options.filter(
                                    (_, oi) => oi !== optionIndex,
                                  ),
                                })
                              }
                              className="text-ink-faint hover:text-rose-deep px-1"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      {question.options.length < 10 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion({
                              options: [...question.options, ''],
                            })
                          }
                          className="pl-6 text-xs font-semibold text-terracotta hover:text-terracotta-deep"
                        >
                          + Add option
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {questions.length < 5 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setQuestions((current) => [
                    ...current,
                    { prompt: '', required: false, kind: 'text', options: [] },
                  ])
                }
              >
                + Add a question
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3 animate-rise">
          {MODE_OPTIONS.map((option) => {
            const active = inviteMode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => setInviteMode(option.mode)}
                aria-pressed={active}
                className={`w-full text-left rounded-card border-2 p-4 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                  active
                    ? 'border-terracotta bg-terracotta-soft shadow-lift'
                    : 'border-line bg-card hover:border-terracotta/50'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span
                    className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl transition-colors ${
                      active ? 'bg-card shadow-lift' : 'bg-cream'
                    }`}
                    aria-hidden
                  >
                    {option.emoji}
                  </span>
                  <div className="flex-1">
                    <p className={`font-extrabold ${active ? 'text-terracotta-deep' : 'text-ink'}`}>
                      {option.title}
                    </p>
                    <p className="text-sm text-ink-soft mt-0.5 leading-relaxed">{option.body}</p>
                  </div>
                  <span
                    aria-hidden
                    className={`grid size-6 shrink-0 place-items-center rounded-pill border-2 transition-colors ${
                      active
                        ? 'border-terracotta bg-terracotta text-white'
                        : 'border-line text-transparent'
                    }`}
                  >
                    <Icon name="check" size={14} />
                  </span>
                </div>
              </button>
            );
          })}

          <Card tone="cream" className="mt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enablePoll}
                onChange={(e) => setEnablePoll(e.target.checked)}
                className="mt-1 size-4 accent-terracotta"
              />
              <span>
                <span className="font-bold">Let the group decide what to do 🗳️</span>
                <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
                  Attendees suggest ideas and rank them privately. The best fit
                  wins - no debates, no loudest-voice problem.
                </span>
              </span>
            </label>
            {enablePoll && (
              <div className="mt-3 space-y-3 pl-7">
                <div className="flex flex-wrap gap-2">
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="suggestDeadline" className="text-xs font-bold text-ink-soft">
                      Suggestions close
                    </label>
                    <input
                      id="suggestDeadline"
                      type="datetime-local"
                      value={suggestDeadline}
                      onChange={(e) => setSuggestDeadline(e.target.value)}
                      className={`${FIELD} py-2.5 text-sm`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="voteDeadline" className="text-xs font-bold text-ink-soft">
                      Voting closes
                    </label>
                    <input
                      id="voteDeadline"
                      type="datetime-local"
                      value={voteDeadline}
                      onChange={(e) => setVoteDeadline(e.target.value)}
                      className={`${FIELD} py-2.5 text-sm`}
                    />
                  </div>
                </div>
              </div>
            )}
            {enablePoll && (
              <div className="mt-3 pl-7 space-y-1.5">
                <label htmlFor="voteDeadline" className="text-sm font-semibold text-ink">
                  Decide by <span className="font-normal text-ink-faint">(optional)</span>
                </label>
                <input
                  id="voteDeadline"
                  type="datetime-local"
                  value={voteDeadline}
                  min={minDate ? `${minDate}T00:00` : undefined}
                  onChange={(e) => setVoteDeadline(e.target.value)}
                  className={`${FIELD} appearance-none [color-scheme:light]`}
                />
                <p className="text-xs text-ink-faint">
                  Voting closes and the winner is picked automatically at this
                  time. Leave blank to decide whenever you’re ready.
                </p>
              </div>
            )}
          </Card>

          <Card tone="cream" className="mt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={remindersEnabled}
                onChange={(e) => setRemindersEnabled(e.target.checked)}
                className="mt-1 size-4 accent-terracotta"
              />
              <span>
                <span className="font-bold">Send a reminder before it starts ⏰</span>
                <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
                  A gentle nudge goes to people who said yes a few hours ahead.
                  Turn this off for a low-key plan that doesn’t need one.
                </span>
              </span>
            </label>
          </Card>

          <Card tone="cream" className="mt-2">
            <p className="font-bold">Theme</p>
            <p className="text-sm text-ink-soft mt-0.5 mb-2.5 leading-relaxed">
              A color for the plan card. Optional.
            </p>
            <div className="flex flex-wrap gap-2">
              {EVENT_THEMES.map((option) => {
                const active = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTheme(option.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-pill border-2 py-1.5 pl-1.5 pr-3.5 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                      active
                        ? 'border-terracotta bg-terracotta-soft'
                        : 'border-line bg-card hover:border-terracotta/50'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`size-6 rounded-full shadow-lift plan-${option.color}`}
                    />
                    <span className="text-sm font-bold">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-rise">
          {(households.length > 0 || circles.length > 0) && (
            <div>
              <p className="text-sm font-bold text-ink mb-2">
                Tap a group to add everyone
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  ...households.map((h) => ({ group: h, toggle: () => toggleHousehold(h) })),
                  ...circles.map((c) => ({ group: c, toggle: () => toggleCircle(c) })),
                ].map(({ group, toggle }) => {
                  const members = group.memberIds.filter((id) =>
                    friends.some((f) => f.id === id),
                  );
                  if (members.length === 0) return null;
                  const allIn = members.every((id) =>
                    invitees.some((i) => i.profileId === id),
                  );
                  return (
                    <Chip
                      key={group.id}
                      emoji={group.emoji}
                      selected={allIn}
                      onClick={toggle}
                    >
                      {group.name} ({members.length})
                    </Chip>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-ink-faint">
                Adds the whole group - then tap anyone below to drop them.
              </p>
            </div>
          )}
          {friends.length === 0 && (
            <Card tone="cream">
              <p className="text-sm text-ink-soft leading-relaxed">
                You haven’t connected with anyone yet - you can still invite
                people as <strong>guests</strong> below. They’ll get a link that
                opens the plan straight away; replying is what asks them to sign
                in.
              </p>
            </Card>
          )}
          {friends.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setFriendsOpen((open) => !open)}
                aria-expanded={friendsOpen}
                className="w-full flex items-center gap-2 mb-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              >
                <span className="flex-1 text-left text-sm font-bold text-ink">
                  Friends · {friends.length}
                  {selectedFriendCount > 0 && (
                    <span className="text-terracotta"> · {selectedFriendCount} selected</span>
                  )}
                </span>
                <Icon
                  name="back"
                  size={18}
                  className={`text-ink-faint transition-transform ${friendsOpen ? 'rotate-90' : '-rotate-90'}`}
                />
              </button>
              {friendsOpen && (
                <div className="grid grid-cols-2 gap-2">
                  {friends.map((friend) => {
                    const selected = invitees.some((i) => i.profileId === friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => toggleFriend(friend)}
                        aria-pressed={selected}
                        className={`flex items-center gap-2 rounded-card border-2 p-2 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                          selected
                            ? 'border-terracotta bg-terracotta-soft'
                            : 'border-line bg-card hover:border-terracotta/50'
                        }`}
                      >
                        <Avatar name={friend.name} seed={friend.id} size="sm" />
                        <span className="flex-1 min-w-0">
                          <span className="font-bold text-sm block truncate">{friend.name}</span>
                          <span className="text-[11px] text-ink-faint block truncate">
                            @{friend.handle}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className={`grid size-5 shrink-0 place-items-center rounded-pill border-2 transition-colors ${
                            selected
                              ? 'border-terracotta bg-terracotta text-white'
                              : 'border-line text-ink-faint'
                          }`}
                        >
                          <Icon name={selected ? 'check' : 'add'} size={12} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <Card>
            <p className="text-sm font-bold text-ink mb-2">Invite by username, email, or phone</p>
            <div className="space-y-2">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft"
              />
              <div className="flex gap-2">
                <input
                  value={guestContact}
                  onChange={(e) => {
                    setGuestContact(e.target.value);
                    if (guestError) setGuestError(null);
                  }}
                  placeholder="@username, email, or phone"
                  className="flex-1 rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={resolvingGuest}
                  onClick={addGuest}
                >
                  {resolvingGuest ? 'Checking…' : 'Add'}
                </Button>
              </div>
              {guestError && (
                <p role="alert" className="text-xs text-rose-deep">
                  {guestError}
                </p>
              )}
              <ContactImportControls
                onContacts={matchContactsFromDevice}
                busy={contactsBusy}
                pickLabel="From my contacts"
              />
              {contactsNote && (
                <p role="status" className="text-xs text-ink-soft">
                  {contactsNote}
                </p>
              )}
            </div>

            {contactMatches.length > 0 && (
              <ul className="mt-3 space-y-2">
                {contactMatches.map((match) => {
                  const selected = isMatchSelected(match);
                  const onApp = Boolean(match.profile);
                  return (
                    <li key={match.key}>
                      <button
                        type="button"
                        onClick={() => toggleContactMatch(match)}
                        aria-pressed={selected}
                        className={`w-full flex items-center gap-3 rounded-card border-2 p-3 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                          selected
                            ? 'border-terracotta bg-terracotta-soft'
                            : 'border-line bg-paper hover:border-terracotta/50'
                        }`}
                      >
                        <Avatar
                          name={match.profile?.name ?? match.name}
                          seed={match.profile?.id ?? match.key}
                          size="sm"
                        />
                        <span className="flex-1 min-w-0 text-left">
                          <span className="font-bold block truncate">
                            {match.profile?.name ?? match.name}
                          </span>
                          <span className="text-xs text-ink-faint block truncate">
                            {onApp ? (
                              <>on Switchboard · @{match.profile!.handle}</>
                            ) : (
                              'not on Switchboard yet · invite by text'
                            )}
                          </span>
                        </span>
                        {onApp && (
                          <span className="shrink-0 rounded-pill bg-sage-soft px-2 py-0.5 text-[11px] font-bold text-sage-deep">
                            In app
                          </span>
                        )}
                        <span
                          aria-hidden
                          className={`grid size-6 shrink-0 place-items-center rounded-pill border-2 transition-colors ${
                            selected
                              ? 'border-terracotta bg-terracotta text-white'
                              : 'border-line text-ink-faint'
                          }`}
                        >
                          <Icon name={selected ? 'check' : 'add'} size={14} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {invitees.length > 0 && (
            <p className="inline-flex items-center gap-1.5 rounded-pill bg-terracotta-soft px-3.5 py-1.5 text-sm font-bold text-terracotta-deep">
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
          {/* Set one window for everybody.
              Asked for as "an option set the time to respond for everyone to
              be the same window. Like a select all button or something" — with
              five people that was five identical dropdowns, and the odds of
              getting all five the same by hand fall with every guest added.
              Shown from two people up, since with one there is no "everyone".
              It sits above the list because it is a decision about the whole
              set; the per-person dropdowns stay exactly where they were, so
              giving one person longer is still a normal thing to do. */}
          {invitees.length > 1 && (
            <div className="rounded-card border-2 border-line bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="window-everyone" className="text-sm font-bold">
                  Everyone gets
                </label>
                <select
                  id="window-everyone"
                  value={commonWindow ?? 'mixed'}
                  onChange={(e) => {
                    if (e.target.value === 'mixed') return;
                    setWindowForEveryone(Number(e.target.value));
                  }}
                  className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-terracotta"
                >
                  {/* Only offered while they really are mixed, and never as a
                      destination — picking "Mixed" would have to invent
                      per-person values it has no way to know. */}
                  {commonWindow === null && (
                    <option value="mixed" disabled>
                      Mixed
                    </option>
                  )}
                  {/* A window typed into a custom row is still a shared window
                      once everyone has it, so it has to be selectable here or
                      the control would read "Mixed" for a list that agrees. */}
                  {commonWindow !== null &&
                    !WINDOW_CHOICES.some((c) => c.windowMinutes === commonWindow) && (
                      <option value={commonWindow}>
                        {splitWindow(commonWindow).amount} {splitWindow(commonWindow).unit}
                      </option>
                    )}
                  {WINDOW_CHOICES.map((choice) => (
                    <option key={choice.windowMinutes} value={choice.windowMinutes}>
                      {choice.label} to respond
                    </option>
                  ))}
                </select>
                {commonWindow !== suggested.windowMinutes && (
                  <button
                    type="button"
                    onClick={() => setWindowForEveryone(suggested.windowMinutes)}
                    className="rounded-pill border border-line px-3 py-1.5 text-sm font-semibold text-terracotta transition-colors hover:border-terracotta"
                  >
                    Use suggested ({suggested.label})
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                {commonWindow === null
                  ? 'Right now people have different windows. Pick one to give everybody the same.'
                  : 'Everyone has the same window. You can still change any one person below.'}
              </p>
            </div>
          )}
          <ol className="space-y-2">
            {invitees.map((invitee, index) => (
              <li
                key={invitee.key}
                className="rounded-card border-2 border-line bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  {inviteMode === 'individual' && (
                    <span className="grid size-7 shrink-0 place-items-center rounded-pill bg-terracotta text-sm font-extrabold text-white">
                      {index + 1}
                    </span>
                  )}
                  <Avatar name={invitee.name} seed={invitee.key} size="sm" />
                  <span className="flex-1 min-w-0">
                    <span className="font-bold block truncate">
                      {invitee.name}
                      {!invitee.profileId && (
                        <span className="ml-1.5 text-xs font-semibold text-gold-deep rounded-pill bg-gold-soft px-1.5 py-0.5">guest</span>
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
                      className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-terracotta"
                    >
                      {Array.from({ length: Math.min(stageCount + 1, 5) }, (_, s) => (
                        <option key={s} value={s}>Wave {s + 1}</option>
                      ))}
                    </select>
                  )}
                  {(() => {
                    const isCustom = !WINDOW_CHOICES.some(
                      (c) => c.windowMinutes === invitee.windowMinutes,
                    );
                    const { amount, unit } = splitWindow(invitee.windowMinutes);
                    return (
                      <>
                        <select
                          value={isCustom ? 'custom' : invitee.windowMinutes}
                          onChange={(e) =>
                            updateInvitee(index, {
                              windowMinutes:
                                e.target.value === 'custom'
                                  ? 120
                                  : Number(e.target.value),
                            })
                          }
                          aria-label={`Response window for ${invitee.name}`}
                          className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors focus:border-terracotta"
                        >
                          {WINDOW_CHOICES.map((choice) => (
                            <option key={choice.windowMinutes} value={choice.windowMinutes}>
                              {choice.label} to respond
                            </option>
                          ))}
                          <option value="custom">Custom…</option>
                        </select>
                        {isCustom && (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              value={amount}
                              onChange={(e) =>
                                updateInvitee(index, {
                                  windowMinutes:
                                    Math.max(1, Math.floor(Number(e.target.value)) || 1) *
                                    UNIT_FACTORS[unit],
                                })
                              }
                              aria-label={`Custom window amount for ${invitee.name}`}
                              className="w-16 rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-terracotta"
                            />
                            <select
                              value={unit}
                              onChange={(e) =>
                                updateInvitee(index, {
                                  windowMinutes:
                                    Math.max(1, amount) *
                                    UNIT_FACTORS[e.target.value as WindowUnit],
                                })
                              }
                              aria-label={`Custom window unit for ${invitee.name}`}
                              className="rounded-pill border border-line bg-paper px-3 py-1.5 text-sm font-medium text-ink outline-none focus:border-terracotta"
                            >
                              <option value="minutes">min</option>
                              <option value="hours">hours</option>
                              <option value="days">days</option>
                            </select>
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-faint">
            💡 Suggested window for this event: <strong>{suggested.label}</strong> -
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
              {
                label: 'Send reminder nudges',
                hint: 'Switchboard can nudge invited people before the plan starts.',
                value: remindersEnabled,
                set: setRemindersEnabled,
              },
              {
                label: 'Require parental approval',
                hint: "Every RSVP needs a parent or guardian's approval before it counts.",
                value: parentalApproval,
                set: setParentalApproval,
              },
            ] as const
          ).map((option) => (
            <Card key={option.label}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={option.value}
                  onChange={(e) => option.set(e.target.checked)}
                  className="mt-1 size-4 accent-terracotta"
                />
                <span>
                  <span className="font-bold">{option.label}</span>
                  <span className="block text-sm text-ink-soft mt-0.5">{option.hint}</span>
                </span>
              </label>
            </Card>
          ))}
          {capacity && Number(capacity) > 1 && (
            <Card tone="gold">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openTable}
                  onChange={(e) => setOpenTable(e.target.checked)}
                  className="mt-1 size-4 accent-terracotta"
                />
                <span>
                  <span className="font-bold">Open Table 🍽️</span>
                  <span className="block text-sm text-ink-soft mt-0.5">
                    If seats stay empty, friends of your attendees can ask to
                    join. You approve every request.
                  </span>
                </span>
              </label>
            </Card>
          )}
          <p className="text-xs text-ink-faint leading-relaxed px-1">
            Defaults are tuned so a one-on-one coffee feels private and a party
            feels social. Invitees never see their position in the cascade.
          </p>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4 animate-rise">
          <Card lifted>
            <h3 className="text-2xl font-black tracking-tight text-ink">{title || 'Untitled plan'}</h3>
            <p className="text-sm text-ink-soft mt-1">
              {startsAt
                ? new Intl.DateTimeFormat('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  }).format(new Date(startsAt))
                : 'Time TBD'}
              {endsAt
                ? ` - ${new Intl.DateTimeFormat('en-US', {
                    hour: 'numeric', minute: '2-digit',
                  }).format(new Date(endsAt))}`
                : ''}
              {locationName ? ` · ${locationName}` : ''}
            </p>
            <p className="text-sm text-ink-faint mt-1">
              {invitees.length} invitee{invitees.length === 1 ? '' : 's'} ·{' '}
              {MODE_OPTIONS.find((o) => o.mode === inviteMode)?.title}
              {capacity ? ` · ${capacity} spots` : ''}
              {enablePoll ? ' · group decides activity' : ''}
            </p>
            {recurrence !== 'none' && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-terracotta-soft px-3 py-1 text-xs font-bold text-terracotta-deep">
                🔁 {recurrenceLabel(recurrence, Number(customDays) || null)}
              </p>
            )}
          </Card>

          <HostSuggestions suggestions={suggestions} />

          {looksOutdoor && (
            <Card tone="gold">
              <p className="text-sm leading-relaxed">
                🌤️ This looks like an outdoor plan - worth a quick peek at the
                forecast before you send it, so you have a plan B if the weather
                turns.
              </p>
            </Card>
          )}

          {!enablePoll && preview.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-ink mb-2">
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
                      <span className="text-terracotta" aria-hidden>→</span>
                      <span className="font-bold flex-1">{invitee?.name}</span>
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
                In reality it usually goes much faster - the moment someone
                accepts, the flow stops.
              </p>
            </div>
          )}

          {enablePoll && (
            <Card tone="gold">
              <p className="text-sm leading-relaxed">
                🗳️ This plan starts in <strong>deciding mode</strong> - invitees
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
          className="rounded-card bg-rose-soft text-rose-deep text-sm font-semibold p-3.5"
        >
          {submitError}
        </p>
      )}

      {/* Nav */}
      <div className="flex gap-3 pt-2">
        {step > 0 && (
          <Button type="button" variant="secondary" size="lg" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            size="lg"
            className="flex-1"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            Next
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
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
