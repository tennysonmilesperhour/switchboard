/**
 * Walkthroughs: short, hands-free demos of Switchboard, played at `/tour/<id>`.
 *
 * Each step is a staged screen that fills itself in — the plan types itself,
 * the invites go out, the chat files itself — while the reader only presses
 * Next. Nothing here touches the reader's account: every name, plan and message
 * on screen is made up, and no step writes anything.
 *
 * One walkthrough is `primary`. It plays once, straight after onboarding, and
 * can be skipped from its first frame. The rest are listed on the feature index
 * (`/features#walkthroughs`) to be taken whenever someone is curious.
 *
 * Rules for editing this file:
 *
 * - **Only show what ships.** Every step names the feature-index entries it
 *   depicts in `features`, and `walkthroughs.test.ts` fails on an id that is
 *   not in `src/lib/features.ts`. The index already refuses to promise
 *   unshipped features; a demo that animated one would be a louder lie.
 * - **The "Try it" link is not written here.** It comes from the first
 *   feature's `href` (or its `start`), so it can never point somewhere the index
 *   would not.
 * - **Keep it quick.** A walkthrough is a few steps, each a sentence or two.
 *   The index is where detail lives.
 */

import { FEATURES, type Feature } from './features';

/** Which staged screen a step plays. Each has a renderer in `TourScenes`. */
export type SceneId =
  | 'start-doors'
  | 'describe-plan'
  | 'cascade'
  | 'invite-link'
  | 'room-filing'
  | 'home-signal'
  | 'import-link'
  | 'cascade-preview'
  | 'response-window'
  | 'rsvp-question'
  | 'after-the-plan'
  | 'decide-ratings'
  | 'availability-grid'
  | 'consensus'
  | 'poll-closes'
  | 'add-someone'
  | 'circles'
  | 'mutual'
  | 'radar'
  | 'give-space'
  | 'room-photos'
  | 'split-bill'
  | 'memory-capsule'
  | 'discover-ideas'
  | 'zones'
  | 'moments'
  | 'map-layers'
  | 'signal-composer'
  | 'quiet-hours'
  | 'sabbatical'
  | 'appearance';

export interface WalkthroughStep {
  id: string;
  title: string;
  /** One or two plain sentences under the screen. */
  caption: string;
  scene: SceneId;
  /** Feature-index ids this step shows. The first one supplies "Try it". */
  features: readonly string[];
}

export interface Walkthrough {
  id: string;
  title: string;
  /** One line on the list: what you'll come away knowing. */
  hint: string;
  emoji: string;
  /** The one played after sign-up. Exactly one walkthrough has this. */
  primary?: boolean;
  steps: readonly WalkthroughStep[];
}

export const WALKTHROUGHS: readonly Walkthrough[] = [
  {
    id: 'welcome',
    title: 'Switchboard in a minute',
    hint: 'One plan, start to finish: the whole idea in six taps.',
    emoji: '✨',
    primary: true,
    steps: [
      {
        id: 'start',
        title: 'Start with the + button',
        caption:
          'Everything begins in the middle of the bottom bar. Got a plan, need the group to decide, or just want ideas — pick a door.',
        scene: 'start-doors',
        features: ['start-something'],
      },
      {
        id: 'describe',
        title: 'Say it like you’d text it',
        caption:
          'Type or speak the plan in your own words. Switchboard fills in the what, when, and where for you to check.',
        scene: 'describe-plan',
        features: ['describe-plan'],
      },
      {
        id: 'cascade',
        title: 'Invites go out in your order',
        caption:
          'Rank who you’d ask first. Each person gets a window to answer, and the chain stops the moment the spots fill, so nobody is over-invited.',
        scene: 'cascade',
        features: ['cascading-invites', 'response-windows'],
      },
      {
        id: 'link',
        title: 'Or just send a link',
        caption:
          'Anyone can open it with no account and no app. Signing in is only asked for when they answer.',
        scene: 'invite-link',
        features: ['guest-links'],
      },
      {
        id: 'room',
        title: 'The chat files itself',
        caption:
          'Every plan gets a room. Drop an address or an “I’ll bring…” and it sorts into Places and Tasks, so nobody scrolls back for it.',
        scene: 'room-filing',
        features: ['living-rooms', 'auto-filing'],
      },
      {
        id: 'home',
        title: 'Home keeps it all in view',
        caption:
          'Your plans, who’s free, and a quick “coffee?” to exactly who you mean. That’s the gist. The rest is in More → Everything, whenever you’re curious.',
        scene: 'home-signal',
        features: ['availability-signals', 'coming-up'],
      },
    ],
  },
  {
    id: 'plans',
    title: 'Making a plan',
    hint: 'Importing, previewing the invite chain, questions, reminders, and what happens after.',
    emoji: '🪜',
    steps: [
      {
        id: 'import',
        title: 'Bring a plan in from a link',
        caption:
          'Paste a Partiful, Luma, Facebook, Apple Invites, or Eventbrite link and the details come straight across.',
        scene: 'import-link',
        features: ['import-from-link'],
      },
      {
        id: 'preview',
        title: 'Watch it before you send it',
        caption:
          'The preview plays your invite chain forward, so you see who gets reached and when before a single invite leaves.',
        scene: 'cascade-preview',
        features: ['cascade-preview', 'host-suggestions'],
      },
      {
        id: 'windows',
        title: 'Give people time, not reminders',
        caption:
          'Each person gets a response window. When it runs out the invite moves on by itself, and you can give someone more time after it’s live.',
        scene: 'response-window',
        features: ['response-windows', 'cascade-editing'],
      },
      {
        id: 'question',
        title: 'Ask while they RSVP',
        caption:
          'Collect allergies or who’s bringing what as people answer. Only you see the answers.',
        scene: 'rsvp-question',
        features: ['rsvp-questions'],
      },
      {
        id: 'after',
        title: 'Reminders, then run it back',
        caption:
          'Reminders go out on their own, inside quiet hours. Once it’s over, one tap starts the next one with the same crew.',
        scene: 'after-the-plan',
        features: ['reminders', 'run-it-back'],
      },
    ],
  },
  {
    id: 'deciding',
    title: 'Deciding together',
    hint: 'Private votes, the free-time grid, and polls that settle themselves.',
    emoji: '🗳',
    steps: [
      {
        id: 'ratings',
        title: 'Everyone rates privately',
        caption:
          'Float a few options. Each person rates them love, good, or rather-not, and nobody sees anyone else’s vote.',
        scene: 'decide-ratings',
        features: ['weighted-input', 'vote-privacy'],
      },
      {
        id: 'grid',
        title: 'Find when everyone’s free',
        caption:
          'People tap the times that work and the overlap lights up. The group sees how many are free, never who.',
        scene: 'availability-grid',
        features: ['availability-grid'],
      },
      {
        id: 'consensus',
        title: 'See where it’s leaning',
        caption: 'The consensus meter shows the group’s lean as a whole, and nothing more.',
        scene: 'consensus',
        features: ['consensus-meter'],
      },
      {
        id: 'resolve',
        title: 'The poll closes itself',
        caption:
          'Set a deadline and walk away. When it closes everyone hears the result, and a winning time becomes the plan’s date.',
        scene: 'poll-closes',
        features: ['poll-resolution'],
      },
    ],
  },
  {
    id: 'people',
    title: 'People and circles',
    hint: 'Adding friends, grouping them, and connecting only when it’s mutual.',
    emoji: '👥',
    steps: [
      {
        id: 'add',
        title: 'Add someone by handle',
        caption:
          'Search an @handle or pull from your contacts. A handle always finds them.',
        scene: 'add-someone',
        features: ['add-someone'],
      },
      {
        id: 'circles',
        title: 'Group them your way',
        caption:
          'Circles hold people the way you think of them, so you can invite or signal a whole circle at once.',
        scene: 'circles',
        features: ['circles', 'households'],
      },
      {
        id: 'mutual',
        title: 'Only if it’s mutual',
        caption:
          'Say you’re down to connect and it stays private unless they say it too. A no is never visible to anyone.',
        scene: 'mutual',
        features: ['mutual', 'rituals'],
      },
      {
        id: 'radar',
        title: 'A nudge about who you miss',
        caption:
          'Reconnection radar quietly points out the people you always mean to see and somehow haven’t.',
        scene: 'radar',
        features: ['reconnection-radar'],
      },
      {
        id: 'space',
        title: 'Give space, privately',
        caption:
          'Name someone you’d rather not run into and you get a private heads-up on plans they may be at. They’re never told.',
        scene: 'give-space',
        features: ['give-space'],
      },
    ],
  },
  {
    id: 'rooms',
    title: 'Keeping it together',
    hint: 'Rooms, photos, splitting the bill, and the memory afterwards.',
    emoji: '💬',
    steps: [
      {
        id: 'filing',
        title: 'A room for every plan',
        caption:
          'Chat like normal. Addresses, tasks, and links sort themselves into tabs, and everything updates live for everyone.',
        scene: 'room-filing',
        features: ['auto-filing', 'live-updates'],
      },
      {
        id: 'photos',
        title: 'Photos in one place',
        caption: 'Pictures sent to the room collect in a Photos tab only the room can open.',
        scene: 'room-photos',
        features: ['room-photos'],
      },
      {
        id: 'split',
        title: 'Split the bill',
        caption:
          'Log who paid and who was in. Switchboard works out who owes whom, and you mark it settled. No money moves through the app.',
        scene: 'split-bill',
        features: ['split-the-bill'],
      },
      {
        id: 'capsule',
        title: 'Keep the night',
        caption:
          'Afterwards everyone adds one line and one photo, and the capsule stays as the record of it.',
        scene: 'memory-capsule',
        features: ['memory-capsule'],
      },
    ],
  },
  {
    id: 'places',
    title: 'Places and chance encounters',
    hint: 'Ideas for tonight, zones, consented moments, and the map.',
    emoji: '📍',
    steps: [
      {
        id: 'ideas',
        title: 'Describe the evening you want',
        caption:
          'Explore turns a few words into fitting ideas, each with a short why. One tap makes any of them a plan.',
        scene: 'discover-ideas',
        features: ['activity-discovery'],
      },
      {
        id: 'zones',
        title: 'Check into a zone',
        caption:
          'A conference, a campus, a festival: check in and “who else is here?” finally has an answer.',
        scene: 'zones',
        features: ['zones'],
      },
      {
        id: 'moments',
        title: 'Moments, by consent',
        caption:
          'Near someone else who checked in? You each step through three consents before either of you is revealed.',
        scene: 'moments',
        features: ['moments'],
      },
      {
        id: 'map',
        title: 'Everything on one map',
        caption: 'Plans, zones, and shared places, as layers you switch on and off.',
        scene: 'map-layers',
        features: ['map'],
      },
    ],
  },
  {
    id: 'you',
    title: 'Making it yours',
    hint: 'Saying you’re free, quiet hours, a sabbatical, and how the app looks.',
    emoji: '🎨',
    steps: [
      {
        id: 'signal',
        title: 'Say you’re free',
        caption:
          'Pick what you’re up for and exactly who hears it. Nothing goes live until you turn it on, and it expires on its own.',
        scene: 'signal-composer',
        features: ['availability-signals'],
      },
      {
        id: 'quiet',
        title: 'Quiet hours',
        caption:
          'Choose when nothing may buzz you. Whatever arrives meanwhile waits in your inbox.',
        scene: 'quiet-hours',
        features: ['quiet-hours', 'notifications-inbox'],
      },
      {
        id: 'sabbatical',
        title: 'Take a sabbatical',
        caption:
          'One switch steps you out of discovery, the map, and Mutual, and holds everything but the plans you’re already in.',
        scene: 'sabbatical',
        features: ['sabbatical'],
      },
      {
        id: 'look',
        title: 'Pick a look',
        caption:
          'Choose a theme, or build one from a photo and three colors. It follows you to every device.',
        scene: 'appearance',
        features: ['appearance'],
      },
    ],
  },
] as const;

export function walkthroughById(id: string): Walkthrough | null {
  return WALKTHROUGHS.find((tour) => tour.id === id) ?? null;
}

export function primaryWalkthrough(): Walkthrough {
  const primary = WALKTHROUGHS.find((tour) => tour.primary);
  if (!primary) throw new Error('No primary walkthrough');
  return primary;
}

/** Where the walkthrough list lives; finishing or skipping a later tour returns here. */
export const WALKTHROUGHS_HOME = '/features#walkthroughs';

/** Where to land after onboarding: the primary tour, then `next`. */
export function firstRunTourPath(next = '/'): string {
  const tour = primaryWalkthrough();
  return `/tour/${tour.id}?first=1&next=${encodeURIComponent(next)}`;
}

/**
 * The "Try it" link for a step: the first feature's own place, or the screen
 * its directions start from. Null only if the catalogue entry is missing,
 * which the test rules out.
 */
export function tryItFor(step: WalkthroughStep): { href: string; label: string } | null {
  const feature: Feature | undefined = FEATURES.find((f) => f.id === step.features[0]);
  if (!feature) return null;
  if (feature.href) return { href: feature.href, label: feature.title };
  if (feature.start) return { href: feature.start.href, label: feature.start.label };
  return null;
}
