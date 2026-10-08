/**
 * The three doors on Start something (`/create`).
 *
 * Shared with the first-run walkthrough, which stages this sheet: a demo that
 * spelled the labels out itself drifted from the real screen within a day, so
 * both now read the one list.
 */
export interface CreateDoor {
  href: string;
  emoji: string;
  title: string;
  body: string;
}

export const CREATE_DOORS: readonly CreateDoor[] = [
  {
    href: '/events/new',
    emoji: '🪜',
    title: 'I’ve got a plan',
    body: 'You know the gist - the what, when, or who. Set it up and send the invites.',
  },
  {
    href: '/events/new?decide=1',
    emoji: '🗳️',
    title: 'Help me figure it out',
    body: 'Not sure yet? Set the scene, float a few options, and let the group vote before anything goes out.',
  },
  {
    href: '/discover',
    emoji: '🧭',
    title: 'Find something to do',
    body: 'Browse ideas and spots that fit the vibe, then turn one into a plan.',
  },
];
