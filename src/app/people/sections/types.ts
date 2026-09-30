import type { AvatarSignal } from '@/components/ui/Avatar';
import type { ErrorCode } from '@/lib/errors';

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

/** Someone the viewer gives space to (G35). Private to the viewer. */
export interface SpaceRow {
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
  /** Who is in it, so the list says more than a count. */
  memberIds?: string[];
}

export interface PeopleMessage {
  tone: 'ok' | 'error';
  text: string;
  /** Stable failure code, shown beside an operational error (see @/lib/errors). */
  code?: ErrorCode;
}
