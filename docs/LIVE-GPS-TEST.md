# Live location test: two phones

A checklist for testing the map, check-ins and discovery on real phones. Each
step says what should happen, so a surprise is a bug rather than a question.
Everything here is also covered by simulated tests (`e2e/people-places.spec.ts`,
`supabase/tests/proximity_matrix.test.sql`); this is what those can't reach.

## Before you start

- **Use the https address** (production or a Vercel preview). Phones refuse
  location to plain `http://`, including a laptop dev server on the same Wi-Fi.
  The app now says so instead of "denied".
- **Two separate accounts**, one per phone. Neither on sabbatical, neither
  blocking the other.
- **iPhone: Precise Location on** for Safari (Settings › Privacy & Security ›
  Location Services › Safari Websites › While Using + Precise). With it off,
  the phone reports a point kilometres away and the app will say "approximate".
  Worth testing once on purpose.
- **For Discover "Nearby"**: both accounts discoverable and "Geography" on
  (Settings › Discoverability), and a home area set in Edit profile › City or
  area. Pick the city from the suggestions so the field says "Pinned"; typed
  text alone saves no point. Without a home point there is nothing to compare,
  so the Nearby lane stays empty by design.
- **Keep the Map page open** on both phones during section 1. A share stays
  visible only while the map is open somewhere: leave it (or lock the screen)
  for 15+ minutes and you drop off until you come back.
- Close extra Switchboard tabs. Two tabs on one phone both send updates.

## 1. The map (live location)

| Do | Expect |
|---|---|
| Phone A: Map › Share my location, allow | "You’re live on the map" within a few seconds |
| Phone B: same, standing next to A | Within ~20 s each sees "1 person is sharing near you" and the other’s pin |
| Both stand still for 5 minutes | Both stay visible; no error toasts |
| A locks the screen for 20 minutes | A drops off B’s map after ~15 minutes |
| A unlocks, map still open | A is back on B’s map within ~20 s |
| A walks 300 m+ away | A’s pin follows, updating every ~15 s while moving |
| A taps Stop | A gone from B’s map at B’s next check (≤20 s) |

Indoors, the first fix may take a few seconds longer: the app now falls back to
a Wi-Fi fix if GPS can’t lock. If the card says "approximate location", the
phone is giving a rough fix (Precise Location off, or no GPS and no Wi-Fi).

## 2. Check-ins (Moments)

| Do | Expect |
|---|---|
| Both, within ~50 m: Moments › type *different* place names › Use my current location › check in | Each sees "Someone here is open to:" (A within ~30 s without reloading) |
| One of them checks in 1 km away instead | No match |
| iPhone with Precise Location off | "Only gave an approximate location", not pinned; matches by place name only |

The 200 m edge is soft by design (positions are rounded to ~110 m for privacy):
people 100–300 m apart may or may not match. Under ~80 m always should.

## 3. Discover

| Do | Expect |
|---|---|
| Both in Discover › Nearby | Each lists the other (homes within ~15 km always; 100 km+ never) |
| Both tap Interested on each other, leaving the context as it is | Second tap: "It is mutual." and a private room |

## 4. Find each other (exact location after a match)

Needs a match room first: either both tap Interested on each other in Discover
(section 3), or both step through a Moment to "matched" (section 2). Either
opens a chat for the two of you under Chats.

| Do | Expect |
|---|---|
| A: open the match chat › 📍 Find each other › Share my exact location, allow | "You're sharing. Waiting for B to share theirs." B gets a chat message saying A is sharing |
| B: open the same chat › 📍 Find each other | No map and no pin for A yet (you only see theirs once you share) |
| B: Share my exact location | Within ~5 s each sees "A is about N m <direction> of you", a map with both pins, and "Walk to A" |
| Stand 50 m apart, then walk toward each other | The distance shrinks within ~5–10 s, no reload |
| Tap "Walk to …" | Apple Maps (iPhone) or Google Maps opens with walking directions to the other person |
| A taps Stop sharing | B is back to "Waiting for A" within ~5 s |
| Leave it on and lock A's phone for 15+ minutes | A drops off B's screen; unlocking brings A back within ~5 s |

Exact means exact: no 110 m blur here, so "about 40 m north" should match
what you see. Within ~15 m it just says "right around you", because the two
phones' own GPS error is bigger than that.

## If something is off

Note the time, both phones’ models and browsers, and any **SB-** code shown.
Codes map to a cause in `src/lib/errors.ts`; the time finds the server log line.
