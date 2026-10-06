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
- **For Discover "Nearby"**: both accounts discoverable, "Geography" on, and a
  home area set in Edit profile. Without a home point there is nothing to
  compare, so the Nearby lane stays empty by design.
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

## If something is off

Note the time, both phones’ models and browsers, and any **SB-** code shown.
Codes map to a cause in `src/lib/errors.ts`; the time finds the server log line.
