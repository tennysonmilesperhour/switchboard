/** Domain choices layered on top of the generated Supabase schema. */

import type { Database, Tables } from '@/lib/supabase/database.types';

/** JSON-backed profile values, validated when read from the database. */
export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileSocial {
  platform: string;
  value: string;
}

/** Table rows come from the generated schema, never a handwritten mirror. */
export type SwitchboardEvent = Tables<'events'>;
export type Invite = Tables<'invites'>;
export type Poll = Tables<'polls'>;
export type PollOption = Tables<'poll_options'>;
export type EventQuestion = Tables<'event_questions'>;
export type LiveLocation = Tables<'live_locations'>;
export type NearbyPerson =
  Database['public']['Functions']['find_nearby_people']['Returns'][number];

/** CHECK-constrained values used when accepting input or choosing UI behavior. */
export type EventStatus =
  | 'draft'
  | 'deciding'
  | 'inviting'
  | 'confirmed'
  | 'cancelled'
  | 'past';
export type InviteMode = 'individual' | 'group' | 'all_at_once';
export type EventTheme = 'default' | 'sunrise' | 'dusk' | 'meadow' | 'ink' | 'blossom';
export type RecurrenceKind = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type DeclineNote = 'keep_asking' | 'not_my_thing' | null;
export type PollSource = 'guests' | 'host' | 'ai';
export type PollTopic = 'date' | 'place' | 'food' | 'activity' | 'custom';
export type IntentKind = 'down_to_connect' | 'open_to_reschedule' | 'discover_connect';
export type RoomItemKind = 'event' | 'address' | 'task' | 'link' | 'photo' | 'note';
export type LocationVisibility = 'sharers' | 'connections';

export const POLL_TOPICS: Array<{
  topic: PollTopic;
  label: string;
  emoji: string;
  question: string;
}> = [
  { topic: 'date', label: 'When', emoji: '📅', question: 'When should this be?' },
  { topic: 'place', label: 'Where', emoji: '📍', question: 'Where should we go?' },
  { topic: 'food', label: 'Food', emoji: '🍜', question: 'What are we eating?' },
  { topic: 'activity', label: 'What', emoji: '🎲', question: 'What should we do?' },
  { topic: 'custom', label: 'Something else', emoji: '💬', question: 'One more thing' },
];

export const SUGGESTED_FOLLOW_UPS: Record<PollTopic, PollTopic[]> = {
  date: ['place', 'activity'],
  place: ['food', 'activity'],
  food: ['custom'],
  activity: ['place', 'food'],
  custom: ['custom'],
};

export function normalizePollTopic(value: string): PollTopic {
  switch (value) {
    case 'date':
    case 'place':
    case 'food':
    case 'activity':
    case 'custom':
      return value;
    default:
      return 'custom';
  }
}

export function pollQuestion(poll: { topic: string; title: string | null }): string {
  if (poll.title?.trim()) return poll.title.trim();
  return (
    POLL_TOPICS.find((entry) => entry.topic === poll.topic)?.question ??
    'What should we do?'
  );
}

export const ACTIVITY_PRESETS = [
  { emoji: '☕', label: 'Coffee' },
  { emoji: '🥪', label: 'Lunch' },
  { emoji: '🍽️', label: 'Dinner' },
  { emoji: '🚶', label: 'Walk or hike' },
  { emoji: '🏋️', label: 'Workout' },
  { emoji: '💻', label: 'Co-working' },
  { emoji: '🎬', label: 'Movie night' },
  { emoji: '🍻', label: 'Drinks' },
  { emoji: '🎵', label: 'Live music' },
  { emoji: '🎲', label: 'Games' },
  { emoji: '🛋️', label: 'Just hang out' },
  { emoji: '🚴', label: 'Bike ride' },
  { emoji: '🧸', label: 'Playdate' },
  { emoji: '🛝', label: 'Park day with kids' },
] as const;

export const SIGNAL_PRESETS = [
  { emoji: '🟢', label: 'Down to Hang' },
  { emoji: '☕', label: 'Coffee Break' },
  { emoji: '🚶', label: 'Walk?' },
  { emoji: '💬', label: 'Available to Chat' },
  { emoji: '🎲', label: 'Game Night' },
  { emoji: '👂', label: 'Happy to Listen' },
  { emoji: '🤝', label: 'Could Use a Friend' },
  { emoji: '📚', label: 'Quiet Company' },
] as const;

export const EXPERIENCE_PRESETS = [
  { emoji: '☕', label: 'Coffee Conversation' },
  { emoji: '🍷', label: 'Share a Glass of Wine' },
  { emoji: '🚶', label: 'Walking Companion' },
  { emoji: '♟️', label: 'Chess' },
  { emoji: '📚', label: 'Book Discussion' },
  { emoji: '💻', label: 'Coworking' },
  { emoji: '🌎', label: 'Travel Stories' },
  { emoji: '🎨', label: 'Creative Conversation' },
  { emoji: '🤝', label: 'Networking' },
  { emoji: '🎲', label: 'Games' },
  { emoji: '🤫', label: 'Quiet Company' },
  { emoji: '👋', label: 'Meet Someone New' },
] as const;
