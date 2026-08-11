> **Historical** (moved to the archive 2026-08-11). These five directions were
> exploration; none was adopted. The app ships the "bold, bright, social" pink +
> Work Sans system documented in [`DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md), which
> is the true source of truth for how the app looks today. Keep this file as a
> menu of alternate directions to pull from if the brand is ever re-themed — the
> 2026-08-11 weekly plan proposes Dusk Lounge and Almanac as the first
> user-selectable appearance presets.

# Switchboard: Five Design Directions

Ground rules that apply to every option below:
- No italics in heroes or headers, anywhere, ever.
- No emdashes in any copy.
- It must not read as AI-made. The tells to avoid: purple-blue gradients,
  glassy cards floating on voids, uniform border radii, centered-everything
  hero with a gradient blob, Inter-only typography, evenly spaced emoji
  bullets, and copy that hedges. Every option below gets its character from
  specificity: real print and signage traditions, uneven rhythm, and one
  strong opinion per screen.

The current build is a soft "warm editorial" placeholder. Pick one of these
and I will rebuild the token layer, type system, and key screens around it.

---

## 1. The Almanac
A well-worn planner or field guide. Cream stock, ink-heavy type, hairline
rules, numbered sections, ticket-stub and stamp motifs for RSVPs and
capsules.

- Palette: cream paper (#f6f1e5), near-black ink, oxblood red for action,
  postal blue for links, no other color.
- Type: Young Serif or Fraunces for display, a grotesque like Archivo for
  UI, and a mono (IBM Plex Mono) for dates, times, and cascade positions.
- Signature moves: event pages laid out like almanac entries with ruled
  detail tables; invitations render as perforated tickets; the cascade is a
  numbered ledger; capsules look like pasted-in scrapbook pages.
- Motion: almost none. Page-turn quick fades. Things stamp into place.
- Why it does not look AI: it borrows from a specific print object with
  rules AI defaults never follow (ledgers, perforation, mono tabular data).
- Best fit if you want: trustworthy, nostalgic, adult. The Field Notes of
  social apps.

## 2. Transit Board
Train-station information design. Strict grid, oversized numerals, flap
board statuses, one signal color on warm off-white. The cascade literally
reads like a departures board: ALEX / ASKED / 14 MIN REMAINING.

- Palette: warm off-white, carbon black, signal orange (#ff5c00), and a
  green reserved for CONFIRMED.
- Type: Inter Tight or Neue Montreal for everything, set tight, with huge
  tabular numerals. No serif anywhere.
- Signature moves: statuses in small caps chips like platform signs; times
  always tabular and right-aligned; rows not cards; flap-board flip
  animation when an invite advances; underlines instead of borders.
- Motion: the flip. Used only for status changes, so motion means news.
- Why it does not look AI: information-design discipline (rows, rules,
  rag-right, one accent) is the opposite of the rounded-card default.
- Best fit if you want: fast, confident, systems-y. Makes the cascade feel
  like infrastructure.

## 3. Corkboard
Neo-brutalist community bulletin board. Chunky black borders, hard offset
shadows, sticker-style chips, slightly rotated pinned cards, marker
annotations. Loud and warm at the same time.

- Palette: butter yellow ground (#f5d95b area washes on warm white), poster
  red, black, with sticker accents in sky blue.
- Type: a display slab or all-caps poster face (Archivo Black) for headers,
  a friendly sans (Karla) for body. Headers upright and heavy, never
  slanted.
- Signature moves: every card looks pinned or taped, 1-2 degree rotations;
  buttons are stickers with hard 4px shadows that squash on press; signals
  are enamel-pin badges; the consensus meter is a hand-drawn progress bar.
- Motion: squash-and-stick. Cards drop onto the board.
- Why it does not look AI: asymmetry, rotation, and hard shadows read
  handmade; AI defaults are symmetrical and soft.
- Best fit if you want: young, energetic, campus and neighborhood energy.

## 4. Dusk Lounge
Evening warmth: the app that feels like the gathering it creates. Deep
espresso and charcoal surfaces, candle-amber accents, hairline brass rules,
serif display with real presence. Dark, but warm dark, never tech dark.

- Palette: espresso (#1e1712), warm charcoal cards, candle amber (#e8a24b),
  cream text, sage kept for confirmations.
- Type: Fraunces at high optical size for display (upright, generous),
  Suisse-like sans (Inter Tight) for UI, small caps for section labels.
- Signature moves: rooms feel like booths with soft pooled light behind
  cards; match reveals glow up from black; capsule pages are gallery-dark
  with amber captions; gold hairlines instead of borders.
- Motion: slow warm fades, light blooming on arrival. Nothing bounces.
- Why it does not look AI: AI dark mode is blue-gray and neon; this is
  candlelight and brass, tuned like a restaurant identity.
- Best fit if you want: intimate, premium, dinner-party gravity.

## 5. Riso Print
Two-ink risograph zine. Teal and tangerine overprint on flecked paper,
visible grain, slightly misregistered accents, hand-cut shapes. The DIY
community-print aesthetic, digitized carefully.

- Palette: paper white with fleck texture, riso teal (#00838a), riso
  tangerine (#ff6a39), overprint brown where they overlap, soft black ink.
- Type: a humanist sans with character (Work Sans or Sohne-ish) plus a
  chunky display face for numbers and headers. Headers always upright.
- Signature moves: section headers overprinted with 2px misregistration;
  duotone avatars; grain texture on section washes; icons look hand-cut;
  empty states are little riso illustrations.
- Motion: stepped, zoetrope-like frames rather than smooth tweens.
- Why it does not look AI: grain, misregistration, and a strict two-ink
  budget are printmaking constraints no generator defaults to.
- Best fit if you want: indie, crafty, third-place culture. The app version
  of a coffee-shop flyer wall.

---

## My recommendation

Transit Board (2) for the product story: the cascade is Switchboard's most
original mechanic, and this direction turns it into the visual identity.
Dusk Lounge (4) is the strongest brand play if the audience skews evening
social. The Almanac (1) is the safest crowd-pleaser of the five.

Reply with a number and I will port the whole app to it.
