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
 * - **Every entry is tappable.** One or the other: an `href` when the feature
 *   is a place, a `start` when it isn't. `start` is not a guessed URL for the
 *   feature; it is the screen `where` begins from, and the test resolves it the
 *   same way. Nothing in this index may be a card you can only read.
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
  /**
   * Where the directions in `where` begin, for a feature that has no page of
   * its own.
   *
   * Not a guess at the feature's URL — that rule stands, and guessing is what
   * it exists to avoid. It is the screen the person has to be standing on
   * before `where` means anything: "Plan wizard → Review" is unfollowable until
   * you have opened the plan wizard. A card that said only "Where: Plan wizard
   * → Review" and offered nothing to tap is what produced "I'm feeling silly,
   * but what do I do from here? Is there a link to click through to?" — and
   * feeling silly reading an index of the app is the index's fault.
   */
  start?: { href: string; label: string };
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
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'response-windows',
        title: 'Response windows',
        blurb:
          'Each person gets a set amount of time to answer before the invite quietly moves on — no chasing, no awkward reminder text.',
        where: 'Plan wizard → Order, and editable after sending',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'cascade-editing',
        title: 'Change the chain after it’s live',
        blurb:
          'Reorder who’s up next, resend an invite, or give someone who hasn’t answered yet more time, without disturbing anyone who already said yes.',
        where: 'Your plan’s page → host controls',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'host-suggestions',
        title: 'Gentle host tips',
        blurb:
          'Quiet, dismissible suggestions while you set a plan up — window lengths, ordering, the things hosts learn the hard way.',
        where: 'Plan wizard → Review (turn them off anytime)',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'guest-links',
        title: 'Invite links',
        blurb:
          'Send anyone a link and the plan opens for them with no account and no app — signing in is only asked for when they answer.',
        where: 'Your plan’s page → Share, and the Invite link card',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'import-from-link',
        title: 'Import a plan from a link',
        blurb:
          'Paste a Partiful, Luma, Facebook, Apple Invites, or Eventbrite link and the details come across into a Switchboard plan.',
        where: 'Plan wizard → Basics → Import from a link',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'describe-plan',
        title: 'Say the plan out loud',
        blurb:
          'Describe what you have in mind — typed or spoken — and the wizard fills in the what, when, and where for you to correct.',
        where: 'Plan wizard → Basics, the describe box at the top',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'rsvp-questions',
        title: 'Ask guests a question',
        blurb:
          'Collect dietary needs or who’s bringing what as people RSVP, and add another question later. Answers are visible only to you.',
        where: 'Plan wizard → Basics, or Edit plan to add one; answers on your plan’s page',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'announcements',
        title: 'Host announcements',
        blurb:
          'The calm version of the text blast: the door code, running late, bring a jacket — lands on the plan page and in the room.',
        where: 'Your plan’s page → Announcements',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'reminders',
        title: 'Automatic reminders',
        blurb:
          'A day-before note to people who are in, a nudge to anyone still holding an invite, and a starting-soon ping — all inside quiet hours.',
        where: 'Plan wizard → Privacy (on by default), or Edit plan to switch them off or on',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'parental-approval',
        title: 'Parental approval',
        blurb:
          'Require a parent or guardian to approve each yes — it waits, without taking a spot, until they answer the link we email them, and you see everyone still waiting.',
        where: 'Plan wizard → Privacy',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'cover-image',
        title: 'Cover image',
        blurb:
          'Give a plan a picture; it renders on the page and in the preview when the link gets texted around.',
        where: 'Plan wizard → Basics, or Edit plan to change it',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'wishlist-link',
        title: 'Wishlist or registry link',
        blurb: 'Point guests at a list without making the plan about presents.',
        where: 'Plan wizard → Basics',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'open-table',
        title: 'Open Table',
        blurb:
          'Leave a few seats open to friends-of-friends, or show the plan to people nearby; they swipe to ask and you approve, so the guest list still belongs to you. Whoever asked hears your answer, yes or no.',
        where: 'Plan wizard → Privacy or Edit plan; requests arrive on the plan page, and your own wait on Explore → Plans',
        href: '/discover',
      },
      {
        id: 'privacy-access',
        title: 'Privacy and access',
        blurb:
          'Change what guests can see about each other — who’s in, and everyone you’ve invited so far — at any point, not just when you set the plan up.',
        where: 'Your plan’s page → Privacy and access',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'co-hosts',
        title: 'Co-hosts',
        blurb:
          'Hand a friend or someone on the guest list the host powers — editing the chain, approving requests, closing polls — because most plans have two organizers. They get a note, the plan shows up in their calendar, and if they were invited they’re down as going (they can change that).',
        where: 'Your plan’s page → Co-hosts',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'calendar-add',
        title: 'Add to calendar',
        blurb:
          'One tap into Google Calendar, or an .ics download for whatever calendar app you actually use.',
        where: 'Any plan page, once you’re in',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'guest-csv',
        title: 'Export the guest list',
        blurb: 'Download who’s coming as a spreadsheet, for name tags and seating.',
        where: 'Your plan’s page → guest list',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'run-it-back',
        title: 'Run it back',
        blurb:
          'Start a fresh plan with the same crew and co-hosts in one tap, minus anyone who said it wasn’t their thing. It opens by asking everyone when works.',
        where: 'A past plan’s page → Run it back',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'schedule-next',
        title: 'Schedule the next one',
        blurb:
          'For the things that repeat: clone the plan forward onto its next date with the same people.',
        where: 'A recurring plan’s page',
        start: { href: '/plans', label: 'Your plans' },
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
        title: 'Private group decisions',
        blurb:
          'Float a few options to start the list, and everyone on it hears there is a vote — guests without the app get the link by email. Everyone rates each option privately as love, good, or rather-not, so people can be honest about a date or a place.',
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
          'Each person taps the parts of the week that work for them, and the plan shows where those overlap — so the dates that reach the poll are ones people can actually make. With a calendar connected it opens already filled in from your free time, as a draft you adjust; nothing reaches the group until you save it. Your own marks stay private either way — the group only ever sees how many are free, never who.',
        where:
          'Start something → Help me figure it out (leave the date open), then the plan’s page',
        start: { href: '/events/new?decide=1', label: 'Help me figure it out' },
      },
      {
        id: 'poll-idea-details',
        title: 'Ideas with links and photos',
        blurb:
          'Attach a description, a link, and a photo to any idea on a poll. Whoever suggested it, or the host, can fix its wording or take it off the list while voting is open.',
        where: 'Any plan with a poll open → Add details, or Edit under an idea',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'consensus-meter',
        title: 'Consensus meter',
        blurb: 'Watch where the group is actually leaning, as an aggregate and nothing more.',
        where: 'Any plan with a poll open',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'vote-privacy',
        title: 'Nobody sees your vote',
        blurb:
          'Not the host, not anyone. Individual votes are unreadable by design — the group only ever sees totals.',
        where: 'Every poll, always',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'poll-resolution',
        title: 'Polls that close themselves',
        blurb:
          'Set a deadline and let a poll resolve on its own, pick the winner yourself, or run a runoff between the top options. When it closes, everyone who was asked hears the result, the host hears when it is their pick, and a winning time from the availability grid becomes the plan’s date.',
        where: 'Plan wizard → Invites, then the plan page',
        start: { href: '/create', label: 'Start something' },
      },
      {
        id: 'poll-chain',
        title: 'One decision unlocks the next',
        blurb:
          'Queue the questions that only make sense later — where, once the date lands; what to eat, once the place does. Each opens by itself when the one before it is settled.',
        where: 'Any plan with a poll → Decide something after this',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'undecided-plans',
        title: 'Share it before the date is settled',
        blurb:
          'A plan whose date is still being polled is still shareable and still answerable — the open date shows as a caveat, not a locked door.',
        where: 'Any plan still deciding its date',
        start: { href: '/plans', label: 'Your plans' },
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
          'Everyone you’re connected to, plus requests waiting on you and the ones you’re waiting on. Search your people and open anyone’s profile. Ignore a request and that person’s requests stay out of sight for 90 days.',
        where: 'More → People',
        href: '/people',
      },
      {
        id: 'people-near-you',
        title: 'People near you',
        blurb:
          'On People, a Near you section lists others in your area who have also opted into discovery and shared their city. It needs discovery and Geography switched on for you, and you only see each other when both sides opt in. Add anyone with one tap.',
        where: 'More → People → Near you',
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
          'Bundle the people who always come as a pair or a family. When you invite people, tapping the household selects everyone in it; picking one person selects just them. Add or remove people any time.',
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
          'Say you’re down to connect with someone and it stays private unless they say it too. A no is never observable by anyone, and either of you can unmatch later.',
        where: 'Home → Mutual',
        href: '/mutual',
      },
      {
        id: 'rituals',
        title: 'Standing rituals',
        blurb:
          'Make a thing a regular thing — monthly dinner, Thursday climbing — and Switchboard reminds you both on the day it’s due. Either of you can plan it or skip that one.',
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
          'Name someone you’d rather not run into. When you say yes to a plan they may also be at, you get a private nudge — never who, never their answer, never anything after. They’re never removed and never told.',
        where: 'Anyone’s profile, and People → a person’s controls. People → Giving space lists everyone you give space to.',
        href: '/people',
      },
      {
        id: 'block-report',
        title: 'Block and report',
        blurb:
          'Blocking is enforced across discovery, matching, the map, and rooms — a one-to-one room becomes read-only for both of you, and in a plan’s room neither of you is notified about the other. Reporting a room message or a board post sends a moderator the message or post itself, not just a name, and moderators can take it down or suspend the account. Both are reachable anywhere you’d actually meet someone, and Settings lists everyone you’ve blocked so you can undo one.',
        where: 'Profiles, a sender’s avatar on their room messages, board posts, moment reveals, and requests. Your blocked list is in Settings.',
        start: { href: '/people', label: 'People' },
      },
      {
        id: 'public-profile',
        title: 'Your public profile',
        blurb:
          'The card people see: your photo, what you’re into, your socials, and a handle you can hand out — with a link to your page you can copy.',
        where: 'More → Profile',
        href: '/profile',
      },
    ],
  },
  {
    id: 'places',
    title: 'Places and chance encounters',
    hint: 'Finding something to do, and finding out who’s already nearby.',
    emoji: '🧭',
    features: [
      {
        id: 'activity-discovery',
        title: 'Find something to do',
        blurb:
          'Describe the kind of evening you want and get a handful of fitting ideas, each with a short why — one tap turns any of them into a plan.',
        where: 'Explore → Plans, under the cards',
        href: '/discover',
      },
      {
        id: 'local-event-discovery',
        title: 'What’s happening nearby',
        blurb:
          'Browse fresh local listings for tonight, this weekend, or the next seven days; search by interest, filter for free events, save or hide one, and jump to the organizer to sign up.',
        where: 'Explore → Around Salt Lake',
        href: '/discover',
      },
      {
        id: 'people-discovery',
        title: 'People discovery',
        blurb:
          'Swipe through people beyond your contacts, filtered by how far they are and what they’re open to — and only if you’ve chosen to be discoverable yourself. Nothing is sent unless you both pick each other.',
        where: 'Explore → People',
        href: '/discover',
      },
      {
        id: 'discovery-lanes',
        title: 'Friends, dating, and networking lanes',
        blurb:
          'Three separate sides of you, each with its own on switch, its own card line, and its own rules for who can see you and who you want to see. Dating and networking stay off until you turn them on, and a pair only appears when both people’s settings let it through.',
        where: 'Explore → People discovery → Discovery settings',
        href: '/discover/preferences',
      },
      {
        id: 'discovery-mood',
        title: 'Mood and how picky you are',
        blurb:
          'Rate what matters to you, then set a baseline bar. A mood like jet-lagged or out for fun raises or lowers it for a while and ends by itself. Nobody sees your mood, and a quiet person looks the same as someone who just doesn’t match.',
        where: 'Explore → People discovery → Discovery settings → How are you feeling?',
        href: '/discover/preferences',
      },
      {
        id: 'verified-places',
        title: 'School and work, checked',
        blurb:
          'List where you studied or work. A claim you typed is labelled as one; confirm it with a school or work email, or have two connections who are confirmed there vouch for it, and it shows as checked. Shared places count for more in discovery.',
        where: 'Edit profile → School and work',
        href: '/profile/edit',
      },
      {
        id: 'venue-perks',
        title: 'Partner perks',
        blurb:
          'Verified local spots offering something to Switchboard groups, and a way to claim your own venue.',
        where: 'Explore → Plans → Partner perks 🏪',
        href: '/discover',
      },
      {
        id: 'moments',
        title: 'Shared moments',
        blurb:
          'Check in somewhere and, if someone else is there too — in the same zone, or within about 200 m — you each step through three moments of consent before either of you is revealed.',
        where: 'More → Around → Moments',
        href: '/moments',
      },
      {
        id: 'zones',
        title: 'Serendipity zones',
        blurb:
          'Named places you check into — a conference, a cruise, a campus, a festival — so “who else is here?” has an answer. Find one by search or near you; each runs until the end date its organizer sets.',
        where: 'More → Around → Zones',
        href: '/zones',
      },
      {
        id: 'private-zones',
        title: 'Private zones',
        blurb:
          'Make a zone visible only to people you let in, by link or by request, and remove anyone later. Someone you pass on is told, and can ask once more after 30 days. Public zones still work exactly as before.',
        where:
          'More → Around → Zones → create one, or a zone you organize → Who can be here',
        href: '/zones',
      },
      {
        id: 'map',
        title: 'The map',
        blurb:
          'Plans, zones, and shared places on one map, as layers you switch on and off.',
        where: 'More → Around → Map',
        href: '/map',
      },
      {
        id: 'live-location',
        title: 'Live on the map',
        blurb:
          'Opt in to appear to other people who are also sharing — mutual, block-aware, blurred to about 110 meters, and it switches itself off after the time you pick, from 30 minutes to 8 hours.',
        where: 'More → Around → Map → the live sharing toggle',
        href: '/map',
      },
      {
        id: 'find-each-other',
        title: 'Find each other',
        blurb:
          'Once you’ve matched with someone, share your exact location with just them for an hour, see theirs on a map with how far and which way, and get walking directions. You only see theirs while you share yours.',
        where: 'More → Rooms → the room a match or a moment opened → 📍 Find each other, at the top',
        start: { href: '/rooms', label: 'Rooms' },
      },
      {
        id: 'boards',
        title: 'Neighborhood boards',
        blurb:
          'Invite-only local boards with notices, offers, requests and recurring happenings, walled off so only members can read them. Share the running with co-moderators.',
        where: 'More → Boards',
        href: '/boards',
      },
      {
        id: 'community',
        title: 'Community',
        blurb: 'Your boards, the community covenant, and what’s expected of everyone.',
        where: 'Settings → Support and legal → Community, and the footer of the welcome page',
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
          'Every plan and every match gets a room, so the conversation lives with the thing it’s about. See who’s in it, jump back to the plan, delete your own messages, mute a room, and leave a match room or a finished plan’s room.',
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
        blurb: 'Send pictures into the room and they collect in a Photos tab. Only people in the room can open them.',
        where: 'Any room → 📷, then the Photos tab',
        href: '/rooms',
      },
      {
        id: 'split-the-bill',
        title: 'Split the bill',
        blurb:
          'Log who paid and who was in on it, see who owes what to whom, and mark it settled once you’ve paid each other back. In US dollars for now, and no money moves through Switchboard.',
        where: 'Any room → Split 💸',
        href: '/rooms',
      },
      {
        id: 'voice-notes',
        title: 'Voice notes',
        blurb:
          'Say it instead of typing it — in a plan’s thread, or as the reason when you have to call something off. A browser that can’t record says so, and you can still write it.',
        where: 'A plan’s page → the comment box, and Cancel this plan',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'live-updates',
        title: 'Everything updates live',
        blurb:
          'Messages, filed items and ticked tasks, expenses, moments, and matches appear for everyone without a refresh.',
        where: 'Rooms, Moments, and Mutual',
        start: { href: '/rooms', label: 'Rooms' },
      },
      {
        id: 'event-thread',
        title: 'The plan’s own thread',
        blurb:
          'Questions and chatter attached to the plan page itself, for people not in the room. Reply to any message and your answer quotes it, so a busy thread stays readable.',
        where: 'Any plan’s page',
        start: { href: '/plans', label: 'Your plans' },
      },
      {
        id: 'memory-capsule',
        title: 'Memory capsules',
        blurb:
          'After it’s over, everyone who went adds one line and one photo. It stays as the record of the night.',
        where: 'A past plan’s page → the capsule',
        start: { href: '/plans', label: 'Your plans' },
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
          'Say “coffee?” to exactly who you mean: circles, specific people, or a whole group you belong to. Each signal picks its own audience, nothing goes live until you tap Turn on, and it expires on its own. A friend who is discoverable, sharing their location and nearby gets one notification, and tapping a friend’s status opens a conversation with them, with Make a plan (and Text instead, for people from your shared contacts) at the bottom.',
        // No condition any more: the composer is always on Home, and says so
        // itself when there is nobody to tell yet. The qualifier that was here
        // existed only because Home hid it outright.
        where: 'Home → I’m free',
        href: '/',
      },
      {
        id: 'social-battery',
        title: 'Social battery',
        blurb:
          'After a plan, one tap on how it left you feeling. Private, and it builds the energy map in Your Read — which times and group sizes fill you up.',
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
        id: 'look-back',
        title: 'Look back',
        blurb:
          'Swipe through plans that are over: left if it wasn’t for you, right if you liked it, up if you loved it, down if you didn’t go. Add a journal note or a few details first if you want. Private to you.',
        where: 'More → Your Read → Reflections',
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
        blurb:
          'Set the hours nothing is allowed to buzz you, in the time zone you choose. What arrives meanwhile waits in your inbox.',
        where: 'Settings → Notifications → Quiet hours',
        href: '/settings',
      },
      {
        id: 'sabbatical',
        title: 'Sabbatical mode',
        blurb:
          'One switch takes you out of radar, the map, discovery, Mutual, matchmaking and ritual reminders, and holds every notification except those from plans you’re already in. Your note shows on your profile and to friends picking you for a plan.',
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
        id: 'sms-preferences',
        title: 'Optional text messages',
        blurb: 'Opt into texts, answer invitations with a reply code, and optionally allow imminent time or location changes during quiet hours. Guests can subscribe from their invitation.',
        where: 'Settings → Notifications → Text messages',
        href: '/settings',
      },
      {
        id: 'notification-preferences',
        title: 'What you get notified about',
        blurb: 'Choose SMS, push, email, or the in-app inbox for plan alerts and reminders. Other categories have separate push controls.',
        where: 'Settings → Notifications',
        href: '/settings',
      },
      {
        id: 'daily-digest',
        title: 'A daily summary',
        blurb:
          'One round-up a day at the hour you pick, instead of a buzz per thing. Invitations, plan changes and reminders still arrive when they happen; without push it comes by email.',
        where: 'Settings → Notifications → A daily summary instead',
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
        title: 'Quick access to Switchboard',
        blurb:
          'On Android, use Switchboard in your browser and bookmark it for quick access. Home-screen installation may be blocked by Android. On iPhone, add it to your home screen for an app-like experience.',
        where: 'Android: browser menu → Bookmark. iPhone: Share → Add to Home Screen',
        start: { href: '/settings', label: 'Settings' },
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
          'Pick a look: the bright default, cream and ink, warm dark, a party-poster dark, a calm black and white, or a serif with one plum. Or build your own from a photo and three colors, with the picture behind everything. It follows your account to every device you sign in on.',
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
        id: 'walkthroughs',
        title: 'Walkthroughs',
        blurb:
          'Short demos that play themselves while you tap Next: one for the whole idea in a minute, and deeper ones on plans, deciding, people, rooms, places, and settings.',
        where: 'More → Everything → Walkthroughs, at the top',
        href: '/tour/welcome',
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
        title: 'Password, your data, delete',
        blurb:
          'Change your password, download a JSON copy of your profile, plans, RSVPs, messages, and signals, sign out, or delete your account — and the media and data attached to it.',
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
