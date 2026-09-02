import type { AvatarSignal } from '@/components/ui/Avatar';

export interface FriendRow {
  connectionId: string;
  id: string;
  name: string;
  handle: string;
  circleIds: string[];
  isAvoided: boolean;
  /** What they're up for right now, when this viewer is in the audience. */
  signal?: AvatarSignal | null;
}

export interface RequestRow {
  connectionId: string;
  id: string;
  name: string;
  handle: string;
}

export interface CircleRow {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
}

export interface HouseholdRow {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
}

export interface PeopleMessage {
  tone: 'ok' | 'error';
  text: string;
}
