# Investor demo

A two-minute, self-contained demo of Switchboard at `/demo/<DEMO_ACCESS_TOKEN>`.
It tells the two-act story from [`PROPOSAL.md`](PROPOSAL.md) (making a plan,
then meeting someone new) on the same staged screens as the walkthroughs. It
needs no account, no seeded data and no network once the page has loaded, so it
also works as the fallback when wifi fails in a live demo.

## Setting it up

1. Set `DEMO_ACCESS_TOKEN` in Vercel to at least 24 random characters
   (`openssl rand -hex 24`) and redeploy.
2. The link is `https://switchboardsocial.me/demo/<token>`. Anything else,
   including a wrong token, shows the ordinary not-found page.
3. To revoke every copy of the link, change the value and redeploy.

## Two ways to use it

| | Link | What happens |
|---|---|---|
| **Send it** | `/demo/<token>` | Plays by itself, about 80 seconds, and stops on the closing card. Pauses when the tab is hidden. Space or the Pause button holds it. |
| **Present it** | `/demo/<token>?mode=present` | Waits for you. A talk track sits under each beat with the title of the next one. |

Keys in both modes: **→ / ←** (or a clicker's Page Down / Page Up) to move,
**P** to switch mode, **F** for full screen, **R** to replay the scene,
**Home / End** to jump. In presenter mode **N** hides the talk track: do this
before sharing your screen, since the audience sees whatever your window shows.

## Presenting tips

- Run it full screen on a laptop at 1366×768 or larger; the phone scales up.
- Let each scene finish before you talk over it. They settle in about five
  seconds.
- Have the real app open on your phone for the "can I see it for real?" moment
  the closing card sets up.
- The hard question is "is this a dating app?". Beats 7 and 8 (Moments and
  Give space) carry the answer: context first, consent at every step, safety
  tools that never tip anyone off.

## Editing the story

The beats, captions and talk track live in
[`src/lib/investor-demo.ts`](../src/lib/investor-demo.ts). Scenes are shared
with the walkthroughs (`src/components/walkthroughs/`), so when a flow changes
and its walkthrough scene is updated, the demo follows automatically.

- Every scene beat names the feature-index ids it shows;
  `investor-demo.test.ts` fails if one leaves `src/lib/features.ts`.
- No traction, market or funding numbers in the demo. Those belong in the deck,
  where each claim is tied to a source.
- The test keeps captions under 200 characters and the whole autoplay run under
  two minutes.
