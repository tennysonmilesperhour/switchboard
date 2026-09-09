import type { InviteMode } from '@/lib/types';
import type { WizardStepKey } from '@/lib/wizard-steps';
import type { ContactMatch } from '@/lib/actions/connections';

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

export interface DraftInvitee {
  key: string;
  profileId: string | null;
  name: string;
  guestContact?: string;
  groupStage: number;
  windowMinutes: number;
}

export interface WizardQuestion {
  prompt: string;
  required: boolean;
  kind: 'text' | 'choice';
  options: string[];
}

export type LocationPoint = { lat: number; lng: number } | null;

export type { WizardStepKey };
export { ALL_WIZARD_STEPS, orderStepNeeded, wizardSteps } from '@/lib/wizard-steps';

/**
 * What each step is called and what it asks. The order people meet them is
 * `wizardSteps` in `src/lib/wizard-steps.ts`: who is coming comes before how
 * the invites go out, because the rhythm of a plan depends on who is on it.
 */
export const STEP_META: Record<
  WizardStepKey,
  { label: string; heading: string; sub: string }
> = {
  basics: {
    label: 'Basics',
    heading: 'I want to...',
    sub: 'Name the plan. A few words is plenty, add the rest below.',
  },
  people: {
    label: 'People',
    heading: 'Who is coming?',
    sub: 'Tap friends, pull matches from your contacts, or invite by username, email, or phone.',
  },
  style: {
    label: 'Invites',
    heading: 'How should invites go out?',
    sub: 'Pick the rhythm that fits this plan and these people.',
  },
  order: {
    label: 'Order',
    heading: 'Set the order',
    sub: 'Decide who hears about it first, and how long each person gets.',
  },
  visibility: {
    label: 'Privacy',
    heading: 'Who sees what',
    sub: 'Tune the privacy for this plan.',
  },
  review: {
    label: 'Review',
    heading: 'Ready to send',
    sub: 'Give it one last look before it goes out.',
  },
};

export const OUTDOOR_HINTS = [
  'hike',
  'hiking',
  'walk',
  'park',
  'picnic',
  'beach',
  'trail',
  'camp',
  'bike',
  'cycling',
  'garden',
  'outdoor',
  'outside',
  'bbq',
  'barbecue',
  'kayak',
  'climb',
  'ski',
  'lake',
  'river',
  'patio',
  'rooftop',
  'festival',
];

export const MODE_OPTIONS: Array<{
  mode: InviteMode;
  title: string;
  body: string;
  emoji: string;
}> = [
  {
    mode: 'all_at_once',
    emoji: '📣',
    title: 'Everyone at once',
    body: 'A classic invitation to your whole list, with a response window. The right choice for most plans.',
  },
  {
    mode: 'individual',
    emoji: '🪜',
    title: 'One at a time',
    body: 'Invite people in your order. When someone accepts, the invitations stop. Perfect for coffee, lunch, or last-minute plans.',
  },
  {
    mode: 'group',
    emoji: '🌊',
    title: 'In waves',
    body: 'Invite groups in stages. Later waves only go out if spots remain - plans fill naturally without overbooking.',
  },
];

export const FIELD =
  'w-full rounded-card border border-line bg-card px-4 py-3 text-[15px] text-ink outline-none transition-colors focus:border-terracotta focus:ring-2 focus:ring-terracotta-soft';
export const FIELD_LABEL = 'text-sm font-semibold text-ink';
export const DEFAULT_START_TIME = '18:00';

export type WindowUnit = 'minutes' | 'hours' | 'days';
export const UNIT_FACTORS: Record<WindowUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

export function splitWindow(minutes: number): { amount: number; unit: WindowUnit } {
  if (minutes % 1440 === 0) return { amount: minutes / 1440, unit: 'days' };
  if (minutes % 60 === 0) return { amount: minutes / 60, unit: 'hours' };
  return { amount: minutes, unit: 'minutes' };
}

export function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * The invite target we'd stage for a matched contact: a real profile if the
 * contact is on Switchboard, otherwise a textable phone/email guest. Matches
 * with neither (name-only, no account) can't be invited, so callers skip them.
 */
export function inviteTargetFor(
  match: ContactMatch,
): { profileId: string | null; contact: string | null } | null {
  if (match.profile) return { profileId: match.profile.id, contact: null };
  const contact = match.smsTarget ?? match.identifier ?? null;
  if (!contact) return null;
  return { profileId: null, contact };
}

/** Whether a matched contact is already on the draft list. */
export function contactMatchSelected(
  match: ContactMatch,
  invitees: readonly DraftInvitee[],
): boolean {
  const target = inviteTargetFor(match);
  if (!target) return false;
  return invitees.some((invitee) =>
    target.profileId
      ? invitee.profileId === target.profileId
      : invitee.profileId === null && invitee.guestContact === target.contact,
  );
}

/**
 * RSVP questions as the server expects them. A choice question keeps its
 * kind only with at least two real options; otherwise it falls back to free
 * text (the server enforces the same rule). Blank prompts are dropped.
 */
export function normalizeWizardQuestions(
  questions: readonly WizardQuestion[],
): Array<{ prompt: string; required: boolean; kind: 'text' | 'choice'; options: string[] }> {
  return questions
    .map((q) => {
      const options = q.options.map((o) => o.trim()).filter((o) => o.length > 0);
      const isChoice = q.kind === 'choice' && options.length >= 2;
      return {
        prompt: q.prompt.trim(),
        required: q.required,
        kind: (isChoice ? 'choice' : 'text') as 'text' | 'choice',
        options: isChoice ? options : [],
      };
    })
    .filter((q) => q.prompt.length > 0);
}
