/**
 * The feature index: one catalogue of everything Switchboard does and where it
 * lives, rendered at `/features`.
 *
 * Switchboard hides most of itself on purpose — the bottom bar shows five
 * things, and the rest surfaces when the moment calls for it. That keeps the
 * app calm, and it means a lot of what was built is never met by the people it
 * was built for. This is the one place that answers "what can this do, and
 * where is it?" without making anyone hunt.
 *
 * Rules for editing this file:
 *
 * - **Only ship what ships.** Every entry describes behavior that exists
 *   today. Roadmap ideas belong in `docs/INNOVATIONS.md`; an index that
 *   promises a feature is worse than no index at all.
 * - **`href` is a real destination.** `src/lib/features.test.ts` resolves every
 *   one against `src/app` and fails on a link to a page that isn't there. A
 *   feature you reach *through* something else (a host control, a wizard step,
 *   a room tab) gets `where` and no `href` — never a guessed URL.
 * - **`where` is written in the words on the screen**, so it can be followed
 *   with thumbs rather than decoded.
 * - **Blurbs say what it does for you**, not how it works underneath.
 */

export interface Feature {
  /** Stable slug. Also the anchor, so a feature can be linked to directly. */
  id: string;
  title: string;
  /** One plain sentence: what you get out of it. */
  blurb: string;
  /** How to reach it, in the app's own words. */
  where: string;
  /** A place you can go, when the feature is one. Omitted when it isn't. */
  href?: string;
}

export interface FeatureGroup {
  id: string;
  title: string;
  /** The question this group answers. */
  hint: string;
  emoji: string;
  features: readonly Feature[];
}

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    id: 'plans',
    title: 'Making a plan',
    hint: 'From the first idea to everyone knowing the door code.',
    emoji: '🪜',
    features: [
      {
        id: 'start-something',
        title: 'Start something',
        blurb:
          'Three doors: a plan you already have, one the group needs to figure out together, or ideas to browse.',
        where: 'The + button in the middle of the bottom bar',
        href: '/create',
      },
      {
        id: 'cascading-invites',
        title: 'Cascading invites',
        blurb:
          'Invite people in your order — one at a time or in waves — and the chain stops the moment someone accepts, so nobody is over-invited.',
        where: 'Start something → I’ve got a plan',
        href: '/events/new',
      },
      {
        id: 'cascade-preview',
        title: 'Preview before you send',
        blurb:
          'A simulator shows exactly who gets reached and in what order, before the first invite goes out.',
        where: 'Plan wizard → Review',
      },
      {
        id: 'response-windows',
        title: 'Response windows',
        blurb:
          'Each person gets a set amount of time to answer before the invite quietly moves on — no chasing, no awkward reminder text.',
        where: 'Plan wizard → Order, and editable after sending',
      },
      {
        id: 'cascade-editing',
        title: 'Change the chain after it’s live',
        blurb:
          'Reorder who’s up next, resend an invite, or lengthen a window without disturbing anyone who already said yes.',
        where: 'Your plan’s page → host controls',
      },
      {
        id: 'host-suggestions',
        title: 'Gentle host tips',
        blurb:
          'Quiet, dismissible suggestions while you set a plan up — window lengths, ordering, the things hosts learn the hard way.',
        where: 'Plan wizard → Review (turn them off anytime)',
      },
      {
        id: 'guest-links',
        title: 'Shareable guest links',
        blurb:
          'Send anyone a link and the plan opens for them with no account and no app — signing in is only asked for when they answer.',
        where: 'Your plan’s page → Share, and the Invite link card',
      },
      {
        id: 'import-from-link',
        title: 'Import a plan from a link',
        blurb:
          'Paste a Partiful, Luma, Facebook, Apple Invites, or Eventbrite link and the details come across into a Switchboard plan.',
        where: 'Plan wizard → Basics → Import from a link',
      },
      {
        id: 'describe-plan',
        title: 'Say the plan out loud',
        blurb:
          'Describe what you have in mind — typed or spoken — and the wizard fills in the what, when, and where for you to correct.',
        where: 'Plan wizard → Basics, the describe box at the top',
      },
      {
        id: 'rsvp-questions',
        title: 'Ask guests a question',
        blurb:
          'Collect dietary needs or who’s bringing what as people RSVP. Answers are visible only to you.',
        where: 'Plan wizard → Basics, answers on your plan’s page',
      },
      {
        id: 'announcements',
        title: 'Host announcements',
        blurb:
          'The calm version of the text blast: the door code, running late, bring a jacket — lands on the plan page and in the room.',
        where: 'Your plan’s page → Announcements',
      },
      {
        id: 'reminders',
        title: 'Automatic reminders',
        blurb:
          'A day-before note to people who are in, a nudge to anyone still holding an invite, and a starting-soon ping — all inside quiet hours.',
        where: 'Plan wizard → Visibility (on by default)',
      },
      {
        id: 'parental-approval',
        title: 'Parental approval',
        blurb:
          'Require a parent or guardian to approve before someone can RSVP yes — for plans that need an adult in the loop.',
        where: 'Plan wizard → Visibility',
      },
      {
        id: 'cover-image',
        title: 'Cover image',
        blurb:
          'Give a plan a picture; it renders on the page and in the preview when the link gets texted around.',
        where: 'Plan wizard → Basics',
      },
      {
        id: 'wishlist-link',
        title: 'Wishlist or registry link',
        blurb: 'Point guests at a list without making the plan about presents.',
        where: 'Plan wizard → Basics',
      },
      {
        id: 'open-table',
        title: 'Open Table',
        blurb:
          'Leave a few seats open to friends-of-friends; they ask to join and you approve, so the guest list still belongs to you.',
        where: 'Plan wizard → Visibility, requests arrive on the plan page',
        href: '/discover',
      },
      {
        id: 'privacy-access',
        title: 'Privacy and access',
        blurb:
          'Change what guests can see about each other — who’s in, the whole invite list, expired invitations — at any point, not just when you set the plan up.',
        where: 'Your plan’s page → Privacy and access',
      },
      {
        id: 'co-hosts',
        title: 'Co-hosts',
        blurb:
          'Hand someone else the host powers — editing the chain, approving requests, closing polls — because most plans have two organizers.',
        where: 'Your plan’s page → Co-hosts',
      },
      {
        id: 'calendar-add',
        title: 'Add to calendar',
        blurb:
          'One tap into Google Calendar, or an .ics download for whatever calendar app you actually use.',
        where: 'Any plan page, once you’re in',
      },
      {
        id: 'guest-csv',
        title: 'Export the guest list',
        blurb: 'Download who’s coming as a spreadsheet, for name tags and seating.',
        where: 'Your plan’s page → guest list',
      },
      {
        id: 'run-it-back',
        title: 'Run it back',
        blurb:
          'Re-invite the same crew to a fresh plan in one tap, minus anyone who said it wasn’t their thing.',
        where: 'A past plan’s page → Run it back',
      },
      {
        id: 'schedule-next',
        title: 'Schedule the next one',
        blurb:
          'For the things that repeat: clone the plan forward onto its next date with the same people.',
        where: 'A recurring plan’s page',
      },
      {
        id: 'coming-up',
        title: 'Everything you’re part of',
        blurb:
          'Invitations waiting on you, what you’re hosting, what you’re going to, and everything that already happened.',
        where: 'Calendar in the bottom bar',
        href: '/plans',
      },
    ],
  },
  {
    id: 'deciding',
    title: 'Deciding together',
    hint: 'Group decisions without the loudest voice winning.',
    emoji: '🗳️',
    features: [
      {
        id: 'weighted-input',
        title: 'Anonymous weighted input',
        blurb:
          'Everyone privately rates each option love / good / rather-not, so people can be honest about a date or a place.',
        where: 'Start something → Help me figure it out',
        href: '/events/new?decide=1',
      },
      {
        // Shipped in the availability-heatmap migration but never indexed, and
        // a tester asked "how do we actually coordinate calendars? is this an
        // option already?" — which is exactly the question this index exists to
        // answer. The `where` leads with the precondition because the grid only
        // renders on a plan with no fixed time yet: someone who set a date in
        // the wizard will not find it on their plan page no matter how hard
        // they look, and directions that omit that send them hunting.
        id: 'availability-grid',
        title: 'When is everyone free',
        blurb:
          'Each person taps the parts of the week that work for them, and the plan shows where those overlap — so the dates that reach the poll are ones people can actually make. Your own marks stay private; the group only ever sees how many are free, never who.',
        where:
          'Start something → Help me figure it out (leave the date open), then the plan’s page',
      },
      {
        id: 'consensus-meter',
        title: 'Consensus meter',
        blurb: 'Watch where the group is actually leaning, as an aggregate and nothing more.',
        where: 'Any plan with a poll open',
      },
      {
        id: 'vote-privacy',
        title: 'Nobody sees your vote',
        blurb:
          'Not the host, not anyone. Individual votes are unreadable by design — the group only ever sees totals.',
        where: 'Every poll, always',
      },
      {
        id: 'poll-resolution',
        title: 'Polls that close themselves',
        blurb:
          'Set a deadline and let a poll resolve on its own, pick the winner yourself, or run a runoff between the top options.',
        where: 'Plan wizard → Style, then the plan page',
      },
      {
        id: 'poll-chain',
        title: 'One decision unlocks the next',
        blurb:
          'Queue the questions that only make sense later — where, once the date lands; what to eat, once the place does. Each opens by itself when the one before it is settled.',
        where: 'Any plan with a poll → Decide something after this',
      },
      {
        id: 'undecided-plans',
        title: 'Share it before the date is settled',
        blurb:
          'A plan whose date is still being polled is still shareable and still answerable — the open date shows as a caveat, not a locked door.',
        where: 'Any plan still deciding its date',
      },
    ],
  },
  {
    id: 'people',
    title: 'People and circles',
    hint: 'Who you know, who you’d like to know, and how much to reveal.',
    emoji: '👋',
    features: [
      {
        id: 'people-home',
        title: 'Your people',
        blurb:
          'Everyone you’re connected to, plus requests waiting on you and the ones you’re waiting on.',
        where: 'More → People',
        href: '/people',
      },
      {
        id: 'add-someone',
        title: 'Add someone',
        blurb:
          'Connect by @handle, or straight from your contacts. Email and phone work too, but only reach someone who verified them — a handle always finds them.',
        where: 'People → Add someone',
        href: '/people',
      },
      {
        id: 'invite-to-switchboard',
        title: 'Invite someone who isn’t here yet',
        blurb:
          'Send a friend the app itself — just a link, with no plan attached and nothing to RSVP to. Contacts who aren’t on Switchboard get their own invite button.',
        where: 'People → Not on Switchboard yet?',
        href: '/people',
      },
      {
        id: 'circles',
        title: 'Circles',
        blurb:
          'Group people the way you actually think of them, then invite or signal a whole circle at once. Rename, re-emoji, add and remove members.',
        where: 'People → Your circles',
        href: '/people',
      },
      {
        id: 'households',
        title: 'Households',
        blurb:
          'Bundle the people who always come as a pair or a family, so inviting one invites the set.',
        where: 'People → Households 🏡',
        href: '/people',
      },
      {
        id: 'matchmaker',
        title: 'Play matchmaker',
        blurb:
          'Introduce two friends over an activity. Each hears about it privately, and they only learn who the other is if both are curious.',
        where: 'People → Play matchmaker 🤝',
        href: '/people',
      },
      {
        id: 'mutual',
        title: 'Mutual',
        blurb:
          'Say you’re down to connect with someone and it stays private unless they say it too. A no is never observable by anyone.',
        where: 'Home → Mutual',
        href: '/mutual',
      },
      {
        id: 'rituals',
        title: 'Standing rituals',
        blurb:
          'Make a thing a regular thing — monthly dinner, Thursday climbing — and Switchboard reminds you both when it’s due.',
        where: 'More → Mutual',
        href: '/mutual',
      },
      {
        id: 'reconnection-radar',
        title: 'Reconnection radar',
        blurb:
          'A quiet nudge about the people you always mean to see and somehow haven’t in a while.',
        where: 'Home, when someone’s been quiet a while',
        href: '/',
      },
      {
        id: 'give-space',
        title: 'Give space',
        blurb:
          'Flag someone you’d rather not run into. You get a private heads-up when they’re visibly going to something — they’re never removed, and never told.',
        where: 'Anyone’s profile, and People → a person’s controls',
        href: '/people',
      },
      {
        id: 'block-report',
        title: 'Block and report',
        blurb:
          'Blocking is enforced across discovery, matching, and the map — not just hidden. Both are reachable anywhere you’d actually meet someone.',
        where: 'Profiles, room members, moment reveals, and requests',
      },
      {
        id: 'public-profile',
        title: 'Your public profile',
        blurb:
          'The card people see: your photo, what you’re into, your socials, and a handle you can hand out.',
        where: 'More → Profile',
        href: '/profile',
      },
    ],
  },
  {
    id: 'places',
    title: 'Places and serendipity',
    hint: 'Finding something to do, and finding out who’s already nearby.',
    emoji: '🧭',
    features: [
      {
        id: 'activity-discovery',
        title: 'Find something to do',
        blurb:
          'Describe the kind of evening you want and get a handful of fitting ideas, each with a short why — one tap turns any of them into a plan.',
        where: 'Explore in the bottom bar',
        href: '/discover',
      },
      {
        id: 'people-discovery',
        title: 'People discovery',
        blurb:
          'Meet people beyond your contacts, in lanes you opt into — and only if you’ve chosen to be discoverable yourself.',
        where: 'Explore → People discovery',
        href: '/discover',
      },
      {
        id: 'venue-perks',
        title: 'Partner perks',
        blurb:
          'Verified local spots offering something to Switchboard groups, and a way to claim your own venue.',
        where: 'Explore → Partner perks 🏪',
        href: '/discover',
      },
      {
        id: 'moments',
        title: 'Shared moments',
        blurb:
          'Check in somewhere and, if someone else is there too, you each step through three moments of consent before either of you is revealed.',
        where: 'More → Moments',
        href: '/moments',
      },
      {
        id: 'zones',
        title: 'Serendipity zones',
        blurb:
          'Named places you check into — a conference, a cruise, a campus, a festival — so “who else is here?” has an answer.',
        where: 'Home → Zones',
        href: '/zones',
      },
      {
        id: 'private-zones',
        title: 'Private zones',
        blurb:
          'Make a zone visible only to people you let in, by link or by request, and remove anyone later. Public zones still work exactly as before.',
        where: 'Zones → create one, or a zone you organize → Who can be here',
        href: '/zones',
      },
      {
        id: 'map',
        title: 'The map',
        blurb:
          'Plans, zones, and shared places on one map, as layers you switch on and off.',
        where: 'More → Map',
        href: '/map',
      },
      {
        id: 'live-location',
        title: 'Live on the map',
        blurb:
          'Opt in to appear to other people who are also sharing — mutual, block-aware, blurred to about 110 meters, and it switches itself off after a couple of hours.',
        where: 'Map → the live sharing toggle',
        href: '/map',
      },
      {
        id: 'boards',
        title: 'Neighborhood boards',
        blurb:
          'Invite-only local boards with notices and recurring happenings, walled off so only members can read them.',
        where: 'More → Boards',
        href: '/boards',
      },
      {
        id: 'community',
        title: 'Community',
        blurb: 'Your boards, the community covenant, and what’s expected of everyone.',
        where: 'More sheet, and the footer of the welcome page',
        href: '/community',
      },
    ],
  },
  {
    id: 'rooms',
    title: 'Keeping it together',
    hint: 'One place per plan for the conversation and the logistics.',
    emoji: '💬',
    features: [
      {
        id: 'living-rooms',
        title: 'Digital living rooms',
        blurb:
          'Every plan and every match gets a room, so the conversation lives with the thing it’s about.',
        where: 'More → Rooms',
        href: '/rooms',
      },
      {
        id: 'auto-filing',
        title: 'Chat that files itself',
        blurb:
          'Drop an address, a task, or a link into the chat and it sorts itself into a tab — nobody scrolls back for the address again.',
        where: 'Any room → Places, Tasks, Links, Notes tabs',
        href: '/rooms',
      },
      {
        id: 'room-photos',
        title: 'Room photos',
        blurb: 'Send pictures into the room and they collect in a Photos tab.',
        where: 'Any room → 📷, then the Photos tab',
        href: '/rooms',
      },
      {
        id: 'split-the-bill',
        title: 'Split the bill',
        blurb:
          'Log what people spent and see who owes what. Settling up happens between you — no money moves through Switchboard.',
        where: 'Any room → Split 💸',
        href: '/rooms',
      },
      {
        id: 'voice-notes',
        title: 'Voice notes',
        blurb:
          'Say it instead of typing it — in a plan’s thread, or as the reason when you have to call something off.',
        where: 'A plan’s page → the comment box, and Cancel this plan',
      },
      {
        id: 'live-updates',
        title: 'Everything updates live',
        blurb:
          'Messages, filed items, moments, and matches appear for everyone without a refresh.',
        where: 'Rooms, Moments, and Mutual',
      },
      {
        id: 'event-thread',
        title: 'The plan’s own thread',
        blurb: 'Questions and chatter attached to the plan page itself, for people not in the room.',
        where: 'Any plan’s page',
      },
      {
        id: 'memory-capsule',
        title: 'Memory capsules',
        blurb:
          'After it’s over, everyone adds one line and one photo. It stays as the record of the night.',
        where: 'A past plan’s page → the capsule',
      },
    ],
  },
  {
    id: 'you',
    title: 'You and your settings',
    hint: 'Your pace, your privacy, and what reaches you.',
    emoji: '✨',
    features: [
      {
        id: 'availability-signals',
        title: 'Availability signals',
        blurb:
          'One tap says “coffee?” to just the circles you choose. No broadcast, and it expires on its own.',
        where: 'Home → I’m free',
        href: '/',
      },
      {
        id: 'social-battery',
        title: 'Social battery',
        blurb:
          'After a plan, one tap on how it left you feeling. Private, and it paces what Switchboard suggests next.',
        where: 'Home, after something you went to',
        href: '/',
      },
      {
        id: 'your-read',
        title: 'Your Read',
        blurb:
          'The picture your own behavior paints — how you plan, who you reach for, what you say yes to. Private to you.',
        where: 'More → Your Read',
        href: '/you',
      },
      {
        id: 'profile-strength',
        title: 'Profile strength',
        blurb: 'What’s still missing from your profile, and why it matters for who finds you.',
        where: 'More → Profile',
        href: '/profile',
      },
      {
        id: 'interests',
        title: 'Interests and what you’re down for',
        blurb:
          'What you like and what you’d say yes to, feeding discovery, matchmaking, and suggestions.',
        where: 'Settings → Interests & activities',
        href: '/settings',
      },
      {
        id: 'discoverability',
        title: 'Discoverability controls',
        blurb:
          'Choose whether you appear in discovery at all, and which lanes — geography, interests, mutuals — can surface you.',
        where: 'Settings → Discoverability',
        href: '/settings',
      },
      {
        id: 'quiet-hours',
        title: 'Quiet hours',
        blurb: 'Set the hours nothing is allowed to buzz you.',
        where: 'Settings → Notifications → Quiet hours',
        href: '/settings',
      },
      {
        id: 'sabbatical',
        title: 'Sabbatical mode',
        blurb:
          'One switch pauses the social machinery. People who reach for you see that you’re taking a quiet season, instead of silence.',
        where: 'Settings → Sabbatical',
        href: '/settings',
      },
      {
        id: 'notifications-inbox',
        title: 'Notifications inbox',
        blurb:
          'Everything that happened while you were away, kept whether or not push is switched on.',
        where: 'The bell in the top right',
        href: '/notifications',
      },
      {
        id: 'notification-preferences',
        title: 'What you get notified about',
        blurb: 'Per-category control over plans, suggestions, reminders, messages, and social news.',
        where: 'Settings → Notifications',
        href: '/settings',
      },
      {
        id: 'push',
        title: 'Push notifications',
        blurb: 'Turn on real push so time-sensitive invitations reach you before the window closes.',
        where: 'Settings → Notifications',
        href: '/settings',
      },
      {
        id: 'install-app',
        title: 'Install Switchboard',
        blurb:
          'Add it to your home screen and it behaves like an app, icon and all. There is no APK and nothing to download — the browser installs it.',
        // The old directions were the iPhone route only. An Android tester who
        // follows them finds no such menu item, and someone who can't install
        // the supported way goes looking for an "app" to download instead.
        where: 'Android: Chrome menu ⋮ → Install app. iPhone: Share → Add to Home Screen',
      },
      {
        // The inbound half of the calendar story. Indexed next to the outbound
        // feed so the two directions are found together — the question people
        // actually arrive with is "what does this do with my calendar", and
        // half an answer is what sends them looking for a feature that is
        // already there.
        id: 'calendar-connect',
        title: 'Connect your calendar',
        blurb:
          'Paste your calendar’s read-only address and a plan’s “when is everyone free” grid starts filled in instead of blank. Busy times only — never what anything is called, where it is, or who else is going — and nothing is ever written back to your calendar.',
        where: 'Settings → Your calendar',
        href: '/settings',
      },
      {
        id: 'calendar-feed',
        title: 'Subscribe your calendar',
        blurb:
          'A private feed of everything you’re going to, so your own calendar app stays current on its own.',
        where: 'Settings → Your calendar',
        href: '/settings',
      },
      {
        id: 'verified-contacts',
        title: 'Verified contact details',
        blurb:
          'Verify an email or phone so invitations sent to it reach your account — and so friends searching for you, or importing their contacts, actually find you. Unverified details match nobody.',
        where: 'Settings → Verified contact details',
        href: '/settings',
      },
      {
        id: 'appearance',
        title: 'How the app looks',
        blurb:
          'Pick a look — cream and ink, warm dark, or the bright default — or build your own from a photo and three colors, with the picture behind everything. It follows your account to every device you sign in on.',
        where: 'Settings → Appearance',
        href: '/settings',
      },
      {
        id: 'passport',
        title: 'What you’ve tried',
        blurb:
          'A private record of which parts of Switchboard you’ve actually used, and a nudge toward one you haven’t. Yours only, and it never pings you.',
        where: 'More → Everything, at the top',
        href: '/features',
      },
      {
        id: 'tips-reset',
        title: 'Bring the tips back',
        blurb: 'Dismissed the getting-started card too early? Restore it.',
        where: 'Settings → Getting started',
        href: '/settings',
      },
      {
        id: 'account-controls',
        title: 'Password, sign out, delete',
        blurb:
          'Change your password, sign out, or delete your account and the data attached to it.',
        where: 'Settings → Account',
        href: '/settings',
      },
      {
        id: 'legal',
        title: 'Privacy, terms, and copyright',
        blurb: 'What’s collected, what’s promised, and a real address for reports.',
        where: 'The footer of the welcome page',
        href: '/privacy',
      },
    ],
  },
] as const;

/** Every feature, flattened — the order the index renders in. */
export const FEATURES: readonly Feature[] = FEATURE_GROUPS.flatMap(
  (group) => group.features,
);

function haystack(feature: Feature, group: FeatureGroup): string {
  return [feature.title, feature.blurb, feature.where, group.title, group.hint]
    .join(' ')
    .toLowerCase();
}

/**
 * Every word has to land somewhere, so "invite link" narrows rather than
 * widening to everything mentioning "invite". Searching across the blurb and
 * the directions as well as the title matters: people look for a feature by
 * what it does for them ("who owes what") far more often than by its name.
 */
export function featureMatches(
  feature: Feature,
  group: FeatureGroup,
  query: string,
): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = haystack(feature, group);
  return terms.every((term) => text.includes(term));
}

/** Groups with their non-matching features removed; empty groups drop out. */
export function filterFeatureGroups(query: string): FeatureGroup[] {
  if (!query.trim()) return [...FEATURE_GROUPS];
  return FEATURE_GROUPS.map((group) => ({
    ...group,
    features: group.features.filter((feature) =>
      featureMatches(feature, group, query),
    ),
  })).filter((group) => group.features.length > 0);
}
