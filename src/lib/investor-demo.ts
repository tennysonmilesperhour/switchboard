/**
 * The investor demo, played at `/demo/<DEMO_ACCESS_TOKEN>`.
 *
 * It is the two-act story from `docs/PROPOSAL.md` (making a plan, then meeting
 * someone new) told with the same staged scenes as the walkthroughs, so it
 * needs no account, no seeded data and no network once loaded. Sent as a link
 * it plays by itself; opened with `?mode=present` it waits for the presenter
 * and shows the talk track under each beat.
 *
 * Rules for editing this file:
 *
 * - **Only show what ships.** Every scene beat names the feature-index entries
 *   it depicts, and `investor-demo.test.ts` fails on an id that is not in
 *   `src/lib/features.ts`. The one exception is the opening group chat, which
 *   shows the problem and no Switchboard screen at all.
 * - **No numbers we have not checked.** Traction, market size and the ask live
 *   in the deck, where each claim is tied to a source. A figure typed here would
 *   be repeated in every meeting with nobody checking it.
 * - **Scenes are shared with the walkthroughs.** Changing a scene changes it
 *   here too, which is the point: the demo cannot drift from the app any further
 *   than the walkthroughs can.
 */

import type { SceneId } from './walkthroughs';

/** The demo's only scene of its own: a group chat where a plan goes to die. */
export type DemoSceneId = SceneId | 'group-chat';

interface BeatBase {
  id: string;
  /** Short label above the title: which part of the story this is. */
  act: string;
  title: string;
  /** What the viewer reads. One or two sentences. */
  caption: string;
  /** The talk track, shown only in presenter mode. */
  notes: string;
}

/** A full-screen card with no phone: the opening and the close. */
export interface CardBeat extends BeatBase {
  kind: 'card';
}

/** A staged screen beside the caption. */
export interface SceneBeat extends BeatBase {
  kind: 'scene';
  scene: DemoSceneId;
  /** Feature-index ids this beat shows. Empty only for the group chat. */
  features: readonly string[];
}

export type DemoBeat = CardBeat | SceneBeat;

export const INVESTOR_DEMO: readonly DemoBeat[] = [
  {
    kind: 'card',
    id: 'open',
    act: 'Switchboard',
    title: 'Plans without pressure.',
    caption:
      'Reaching out is hard. Switchboard handles the asking, the waiting, and the deciding, so more plans actually happen.',
    notes:
      'One line on who you are, then: "Everyone here has a friend they keep meaning to see. This is about why that plan never gets made."',
  },
  {
    kind: 'scene',
    id: 'problem',
    act: 'The problem',
    title: 'Most plans die in the group chat.',
    caption:
      'Everyone is keen, nobody commits, and asking one person directly feels like a big deal. So the plan never leaves the chat.',
    scene: 'group-chat',
    features: [],
    notes:
      'Let the chat play. Point out that nobody said no. The plan died of politeness: a broadcast puts everyone on the spot, so nobody answers for real.',
  },
  {
    kind: 'scene',
    id: 'describe',
    act: 'Act 1 · Making a plan',
    title: 'Say it like you’d text it.',
    caption:
      'Type or speak the plan in your own words. Switchboard fills in the what, when, and where in seconds.',
    scene: 'describe-plan',
    features: ['describe-plan'],
    notes:
      'The bar to start a plan is one sentence. No form, no calendar picker. This is the moment a group chat would have started.',
  },
  {
    kind: 'scene',
    id: 'cascade',
    act: 'Act 1 · Making a plan',
    title: 'Invites go out one at a time.',
    caption:
      'Rank who you’d ask. Each person gets a private window to answer, and the chain stops the moment the spots fill.',
    scene: 'cascade',
    features: ['cascading-invites', 'response-windows'],
    notes:
      'This is the core mechanic. Jordan says no and nobody sees it. Priya is asked next. Sam is never pinged, so nobody is over-invited and nobody is told they were second choice.',
  },
  {
    kind: 'scene',
    id: 'link',
    act: 'Act 1 · Making a plan',
    title: 'No app needed to say yes.',
    caption:
      'Guests open the plan from a link with no account and no install. Signing in is only asked for when they answer.',
    scene: 'invite-link',
    features: ['guest-links'],
    notes:
      'Every plan a host sends puts Switchboard in front of people who have never heard of it, at the moment they are being invited somewhere.',
  },
  {
    kind: 'scene',
    id: 'room',
    act: 'Act 1 · Making a plan',
    title: 'The plan gets a room.',
    caption:
      'Chat like normal. Addresses and “I’ll bring…” sort themselves into Places and Tasks, so nobody scrolls back for them.',
    scene: 'room-filing',
    features: ['living-rooms', 'auto-filing'],
    notes:
      'The conversation moves out of the group chat and into a room tied to the plan. That is where people come back to, before and after the night.',
  },
  {
    kind: 'scene',
    id: 'mutual',
    act: 'Act 2 · Meeting someone new',
    title: 'Interest stays private until it’s mutual.',
    caption:
      'Say you’re down to connect and it stays hidden unless they say it too. A no is never visible to anyone.',
    scene: 'mutual',
    features: ['mutual'],
    notes:
      'Act 2 is meeting new people, and it is built consent first. Neither side is exposed until both have opted in, so asking costs nothing.',
  },
  {
    kind: 'scene',
    id: 'moments',
    act: 'Act 2 · Meeting someone new',
    title: 'Three consents before a reveal.',
    caption:
      'Near someone else who checked in? You each step through three consents before either of you is shown.',
    scene: 'moments',
    features: ['moments'],
    notes:
      'Expect "is this a dating app?" The answer is no: it is context first (the same event, the same zone) and both people agree at every step before anything is revealed.',
  },
  {
    kind: 'scene',
    id: 'safety',
    act: 'Act 2 · Meeting someone new',
    title: 'Safety tools that never tip anyone off.',
    caption:
      'Name someone you’d rather not run into and get a private heads-up on plans they may join. They’re never told.',
    scene: 'give-space',
    features: ['give-space'],
    notes:
      'Safety is part of the product, not a settings page. Mention block, report and moderation are also built, and that the database itself enforces who can see what.',
  },
  {
    kind: 'card',
    id: 'close',
    act: 'Switchboard',
    title: 'More plans. Less pressure.',
    caption:
      'Cascading invites, plans anyone can open, and connections that only happen when both people want them. Built and live today.',
    notes:
      'Stop here and take questions. If they want to see it for real, open the app on your phone and make a plan in front of them.',
  },
] as const;

export function sceneBeats(): SceneBeat[] {
  return INVESTOR_DEMO.filter((beat): beat is SceneBeat => beat.kind === 'scene');
}

/**
 * How long a beat stays up when the demo plays by itself: long enough for the
 * scene to finish (scenes settle in about five seconds) and for an unhurried
 * reader to get through the title and caption.
 */
export function beatDurationMs(beat: DemoBeat): number {
  const words = `${beat.title} ${beat.caption}`.split(/\s+/).filter(Boolean).length;
  const reading = 1500 + words * 260;
  return Math.max(beat.kind === 'scene' ? 6500 : 4500, reading);
}
