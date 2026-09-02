# Naming checklist

The reference page for what things are called. One row per user-facing name:
where it appears, what it used to be called, and a decision.

**The in-app reference is [`/features`](../src/lib/features.ts)** — that is what
a user reads. This file is the working checklist behind it, for deciding what a
thing should be called before the rename happens.

## How to use it

- **Decision column** is the deliverable: `keep`, `rename → X`, or `retire`.
  Nothing is renamed until a decision is recorded here.
- **Apply renames in batches**, one PR per coherent group.
  `src/lib/features.test.ts` fails when a nav destination and the index
  disagree, so it will name every surface that must move together.
- **Never rename a stored string.** Interest and activity labels
  (`src/lib/interests.ts`) live in `text[]` columns on profiles; renaming one
  orphans everyone who picked it. Additive only.

## The naming rules this codebase already follows

Drawn from what shipped, so new names inherit the same voice:

1. **Name it by what the person gets, not by the mechanism.** `/welcome` was
   deliberately de-jargoned: "Anonymous Weighted Input" became "everyone rates
   options privately". The feature index blurbs are all written this way.
2. **The plain word beats the coined one.** "Plan" beats "event" in prose
   (though `events` is the table). "Room" beats "Digital Living Room" in
   navigation.
3. **No possessive-your everywhere.** "Your Read" earns it (it is private and
   about you); most surfaces don't.
4. **Verbs for actions, nouns for places.** Nav destinations are nouns
   (People, Rooms, Zones); the things you tap inside them are verbs
   ("Give space", "Run it back").

---

## Navigation

| Name | Where it appears | Legacy / alternates | Decision |
|---|---|---|---|
| Home | Bottom bar tab 1, `/` | — | keep |
| Explore | Bottom bar tab 2, routes to `/discover` | "Discover" (route name, and the Home tile still says Discover) | **decide** — the tab says Explore, the route and the Home tile say Discover. Pick one word and make all three agree. Recommend **Explore** for the tab and heading, since the route can stay `/discover` without a user ever reading it. |
| (create FAB) | Bottom bar center, `/create` | "New plan", "Start something" | **decide** — the FAB has `aria-label="Create a plan"`, the index calls the destination "Start something", Home said "New plan". Recommend **Start something** everywhere (it covers all three doors: a plan you have, one to figure out, or ideas to browse). |
| Calendar | Bottom bar tab 4, `/plans` | "Plans", "Coming up" | keep — "Calendar" as the tab, "Coming up" as the section inside it, is working |
| More | Bottom bar tab 5 (sheet) | — | keep |
| Everything | More sheet → `/features` | "Feature index" (internal) | keep |
| Around | More sheet → `/map`, with Map, Zones, and Moments as tabs; a Home pillar only when the viewer's city has an anchored zone or a live sharer | "Map", "Zones", "Moments" as three separate More entries | keep — one door for the three serendipity surfaces (remediation 18), so a person with no local density meets one closed door instead of three empty rooms |

## The Home pillars

The row is gated (remediation 18): Make a plan, People, and Plans always;
Mutual and I'm free once a connection exists; Around only with local density.

| Name | Where it appears | Legacy / alternates | Decision |
|---|---|---|---|
| Make a plan | Home pillar row → `/create` | "New plan", "Float an idea" | keep — "Float an idea to your people" stays as the empty-state copy, which is warmer for a first plan |
| Mutual | Home pillar row, More sheet, `/mutual` | "Mutual Mode", "Down to Connect" | keep **Mutual** as the place; "Down to connect" stays as the action inside it |
| I'm free | Home pillar row → the signal composer | "Availability signals", "Signals", "Coffee Break?" | **decide** — the feature is "Availability signals" in the index, the composer is a chip row with no title, and the pillar says "I'm free". Recommend keeping **I'm free** as the tap and **Availability signals** as the catalogue name; they serve different readers. |
| People | Home pillar row → `/people` | "Friends" | keep — same word as the More sheet entry |
| Plans | Home pillar row → `/plans` | "Calendar" (the bottom-bar tab for the same route) | **decide** — the pillar says Plans and the tab says Calendar for one destination. Recommend **Plans** for both, since "plan" is the word the product uses everywhere else. |
| Around | Home pillar row → `/map`, only with local density | — | keep; see Navigation |
| Zones | More → Around → Zones tab, `/zones` | "Serendipity Zones"; formerly a Home pillar | **decide** — README and the index say "Serendipity zones", nav says "Zones". Recommend **Zones** in nav, **Serendipity zones** on first introduction only. |

## Core mechanics

| Name | Where it appears | Legacy / alternates | Decision |
|---|---|---|---|
| Cascading invites | Features index, README | "the cascade" (internal), "Cascade" | keep; "the chain" is the in-product plain-language version and is working ("Change the chain after it's live") |
| Response window | Wizard, host controls | "window" | keep |
| Anonymous weighted input | Features index, README | "AWI" (internal only), "the poll" | **decide** — README leads with "Anonymous Weighted Input" as a proper noun, which is exactly the jargon `/welcome` removed. Recommend **"Private group decisions"** as the name and "everyone rates options privately" as the blurb; keep AWI internal. |
| Consensus meter | Plan page with an open poll | — | keep |
| Poll | Plan page, wizard | "group decision", "vote" | keep — "poll" is the plain word; "group decision" is the concept |
| Guest link / Invite link | Plan page Share, Invite link card | "share link", "token link" | **decide** — three names for one URL ("Shareable guest links" in the index, "Invite link" on the card, "Share" on the button). Recommend **Invite link** everywhere user-facing. |
| Run it back | Past plan page | "clone", "re-invite" | keep |
| Open Table | Wizard visibility, index | "friends-of-friends" | keep |
| Co-hosts | Plan page | — | keep |

## People

| Name | Where it appears | Legacy / alternates | Decision |
|---|---|---|---|
| People | More sheet, `/people` | "Friends", "Contacts" | keep |
| Circles | `/people`, wizard, signals audience | "audiences", "groups" | keep — and note this is why "groups" is ambiguous in this product; see Zones/Boards below |
| Households | `/people` | — | keep |
| Give space | `/people` person controls | "ex-filter" (internal, in DOCKET) | keep the user-facing name; "ex-filter" is internal shorthand only |
| Play matchmaker | `/people` | "Third-Party Matchmaker" (INNOVATIONS) | keep |
| Standing rituals | `/mutual`, index | "Rituals" | keep |
| Reconnection radar | Home | "radar" | keep |
| Your Read | More sheet, `/you` | "Social battery", "insights" | keep — distinct from Social battery, which is one input to it |

## Places and community

| Name | Where it appears | Legacy / alternates | Decision |
|---|---|---|---|
| Boards | More sheet, `/boards` | "Neighborhood boards" | keep both: **Boards** in nav, **Neighborhood boards** in the index |
| Zones | See pillars above | "Serendipity zones" | see above |
| Moments | More → Around → Moments tab, `/moments` | "Shared Moments" | keep both, same pattern as Boards |
| Map | More → Around → Map tab, `/map` | "Live on the map" | keep — "Live on the map" names the opt-in sharing, not the page |
| Rooms | More sheet, `/rooms` | "Digital Living Rooms", "Living rooms" | keep **Rooms** in nav; "Digital living rooms" is the index/marketing name |
| Community | `/community` | — | keep |
| Partner perks | Explore | "Venue Perks" (INNOVATIONS) | keep |

## Terms that need one answer

These are the ones where the same idea has more than one word across surfaces.
Resolving them is most of the value of this page.

| Concept | Words in use | Recommendation |
|---|---|---|
| The thing you organize | plan, event, gathering | **Plan** in all copy. `events` stays as the table/route; a user never reads it. Audit: the wizard, plan page, and notifications. |
| The place people talk | room, living room, chat, thread | **Room** for the space; **thread** only for the plan-page comments (a genuinely different surface). |
| Discovery surface | Explore, Discover | Pick one (recommend Explore) — currently disagreeing between the tab and the Home tile. |
| The link you send | invite link, guest link, share link | **Invite link.** |
| People you know | friends, connections, people | **People** as the place, **friends** in prose, `connections` internal only. |
| A private group of people | circle, household, board, zone | Already distinct concepts; keep, but never use the bare word "group" in UI copy, since it maps to four different things here. |

## Open naming questions

1. Does "Mutual" read as a noun to a new user, or does it need "Mutual
   interest" on first contact? (The weekly plan's pillar row is the first place
   it appears cold.)
2. Is "Your Read" clear without opening it? It is the most abstract name in the
   product.
3. Should "Serendipity" survive anywhere user-facing, or is it a word the app
   should demonstrate rather than say?
