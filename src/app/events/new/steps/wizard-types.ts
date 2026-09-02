import type { InviteMode } from '@/lib/types';

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

export const STEPS = ['Basics', 'Style', 'People', 'Order', 'Visibility', 'Review'] as const;

export const STEP_META: Array<{ heading: string; sub: string }> = [
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
  {
    mode: 'all_at_once',
    emoji: '📣',
    title: 'Everyone at once',
    body: 'A classic invitation to your whole list, with a response window.',
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
