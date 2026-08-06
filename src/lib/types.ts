/** Domain types mirroring the Supabase schema. */

import type { InviteStatus } from '@/lib/engine/cascade';
import type { Weight } from '@/lib/engine/scoring';

/** A free-form labelled link on a profile (personal site, portfolio, etc.). */
export interface ProfileLink {
  label: string;
  url: string;
}

/** A social handle. `platform` keys into SOCIAL_PLATFORMS; `value` is a
 *  handle or a full URL (normalised to a URL at render time). */
export interface ProfileSocial {
  platform: string;
  value: string;
}

export interface Profile {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  tagline: string | null;
  pronouns: string | null;
  location: string | null;
  links: ProfileLink[];
  socials: ProfileSocial[];
  contact_email: string | null;
  contact_phone: string | null;
  contact_public: boolean;
  interests: string[];
  down_to: string[];
  sabbatical: boolean;
  sabbatical_message: string | null;
  quiet_hours_start: number | null; // hour 0-23, local
  quiet_hours_end: number | null;
  created_at: string;
}

export interface EventCoHost {
  event_id: string;
  cohost_id: string;
  added_by: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  room_id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  settle_url: string | null;
  created_by: string;
  created_at: string;
}

export type BoardRole = 'member' | 'moderator';
export type BoardPostKind = 'notice' | 'event';

export interface Board {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface BoardMember {
  board_id: string;
  member_id: string;
  role: BoardRole;
  joined_at: string;
}

export interface BoardPost {
  id: string;
  board_id: string;
  author_id: string;
  kind: BoardPostKind;
  title: string;
  body: string | null;
  location: string | null;
  cadence: string | null;
  starts_at: string | null;
  created_at: string;
}

export interface Circle {
  id: string;
  owner_id: string;
  name: string;
  emoji: string;
  created_at: string;
}

export interface CircleMember {
  circle_id: string;
  member_id: string;
}

export type ConnectionStatus = 'pending' | 'accepted';

export interface Connection {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: ConnectionStatus;
  created_at: string;
}

export type EventStatus = 'draft' | 'deciding' | 'inviting' | 'confirmed' | 'cancelled' | 'past';
export type InviteMode = 'individual' | 'group' | 'all_at_once';
export type EventTheme = 'default' | 'sunrise' | 'dusk' | 'meadow' | 'ink' | 'blossom';
export type RecurrenceKind = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface SwitchboardEvent {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  location_name: string | null;
  location_address: string | null;
  starts_at: string | null;
  ends_at: string | null;
  /** IANA zone the host created/edited the plan in; anchors how `starts_at` is
   *  rendered on the server, where there is no viewer zone. Null for undated
   *  plans and any created before the zone was captured. */
  time_zone: string | null;
  capacity: number | null;
  invite_mode: InviteMode;
  status: EventStatus;
  /** Open table: anyone can ask to join (via the friends-of-friends discover
   *  feed or the older /join link); the host approves each request. */
  open_table: boolean;
  /** Capability token behind the plan's public share link (`/i/<token>`) — the
   *  one link a host can text to anyone. Immutable except through
   *  `rotate_event_share_token`. */
  share_token: string;
  /** Host's kill switch for that share link. Defaults true in the database, so
   *  every plan has a working link however it was created. */
  share_link_active: boolean;
  /** Visibility settings */
  show_invite_list: boolean;
  show_accepted: boolean;
  show_expired: boolean;
  room_id: string | null;
  /** Presentation */
  cover_url: string | null;
  theme: EventTheme;
  wishlist_url: string | null;
  /** Recurrence: how often the plan repeats, and the day-count for a custom cadence. */
  recurrence: RecurrenceKind;
  recurrence_interval_days: number | null;
  /** Reminders */
  reminders_enabled: boolean;
  reminded_day_before_at: string | null;
  reminded_soon_at: string | null;
  /** Cancellation context (set when the host calls a plan off) */
  cancel_reason: string | null;
  cancel_voice_url: string | null;
  /** Set when a host marks the plan as having actually happened. */
  happened_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface EventComment {
  id: string;
  event_id: string;
  author_id: string;
  body: string | null;
  voice_url: string | null;
  voice_duration_seconds: number | null;
  created_at: string;
}

export interface EventQuestion {
  id: string;
  event_id: string;
  prompt: string;
  required: boolean;
  position: number;
  /** 'text' (free response) or 'choice' (pick one of `options`). */
  kind: 'text' | 'choice';
  /** Selectable answers for a 'choice' question; empty for 'text'. */
  options: string[];
  created_at: string;
}

export interface InviteAnswer {
  id: string;
  invite_id: string;
  question_id: string;
  answer: string;
  created_at: string;
}

export type DeclineNote = 'keep_asking' | 'not_my_thing' | null;

export interface Invite {
  id: string;
  event_id: string;
  invitee_id: string | null;
  guest_name: string | null;
  guest_contact: string | null;
  guest_token: string | null;
  position: number;
  group_stage: number;
  window_minutes: number;
  status: InviteStatus;
  sent_at: string | null;
  responded_at: string | null;
  decline_note: DeclineNote;
  decline_message: string | null;
  created_at: string;
}

export type PollPhase = 'suggesting' | 'voting' | 'runoff' | 'decided';
export type PollResolution = 'host_pick' | 'auto' | 'runoff';
export type PollSource = 'guests' | 'host' | 'ai';

export interface Poll {
  id: string;
  event_id: string;
  phase: PollPhase;
  resolution: PollResolution;
  allow_suggestions: boolean;
  suggest_deadline: string | null;
  vote_deadline: string | null;
  winning_option_id: string | null;
  created_at: string;
}

export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  detail: string | null;
  source: PollSource;
  created_at: string;
}

export interface PollVote {
  poll_id: string;
  option_id: string;
  voter_id: string;
  weight: Weight;
}

export type IntentKind = 'down_to_connect' | 'open_to_reschedule' | 'discover_connect';
export type IntentStatus = 'active' | 'matched' | 'withdrawn';

export interface MutualIntent {
  id: string;
  author_id: string;
  target_id: string;
  activity: string;
  kind: IntentKind;
  event_id: string | null; // for open_to_reschedule
  status: IntentStatus;
  created_at: string;
}

export interface Match {
  id: string;
  user_a: string;
  user_b: string;
  activity: string;
  kind: IntentKind;
  event_id: string | null;
  room_id: string | null;
  created_at: string;
}

export interface AvailabilitySignal {
  id: string;
  user_id: string;
  emoji: string;
  label: string;
  circle_ids: string[]; // empty = all connections; otherwise the union of these circles
  expires_at: string;
  created_at: string;
}

export type RoomKind = 'event' | 'match' | 'group' | 'moment';

export interface Room {
  id: string;
  kind: RoomKind;
  title: string;
  created_by: string;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export type RoomItemKind = 'event' | 'address' | 'task' | 'link' | 'photo' | 'note';

export interface RoomItem {
  id: string;
  room_id: string;
  message_id: string | null;
  kind: RoomItemKind;
  title: string;
  detail: string | null;
  url: string | null;
  done: boolean;
  created_by: string | null;
  created_at: string;
}

export type MomentStatus = 'open' | 'matched' | 'closed';

export interface Moment {
  id: string;
  user_id: string;
  place_name: string;
  experiences: string[];
  headline: string | null;
  available_until: string;
  status: MomentStatus;
  created_at: string;
}

export type MomentInterestStage = 'curious' | 'revealed' | 'accepted' | 'passed';

export interface MomentInterest {
  id: string;
  moment_id: string;
  other_moment_id: string;
  stage: MomentInterestStage;
  created_at: string;
}

/** Who a live location is visible to (besides the owner, who always sees it). */
export type LocationVisibility = 'sharers' | 'connections';

/** The owner's own live-location row (`live_locations`). Owner-only under RLS. */
export interface LiveLocation {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  headline: string | null;
  emoji: string | null;
  visibility: LocationVisibility;
  updated_at: string;
  expires_at: string;
}

/** One nearby sharer as returned by the `find_nearby_people` RPC. Coordinates
 *  are already coarsened server-side; identity is only ever returned to a caller
 *  who is themselves sharing (mutual) and whom the target permits. */
export interface NearbyPerson {
  user_id: string;
  distance_m: number;
  latitude: number;
  longitude: number;
  headline: string | null;
  emoji: string | null;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  interests: string[];
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
