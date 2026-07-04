# Switchboard - 10 Bold Ideas for Your Review

The 10 safe bets are already in v1 (guest links, cascade simulator, teaching
declines, smart windows, circles, consensus meter, calendar export, quiet
hours, OG images, PWA + push). These ten are bigger swings - each with a
rationale, rough effort, and the main risk. **None are built yet.**

---

## 1. Standing Rituals 🔁
Recurring *flexible* plans: "dinner with Sam, roughly every 3 weeks."
Switchboard watches both people's availability signals and quietly proposes
the next date; either person can nudge or skip guilt-free.
**Why:** retention gold - the app becomes the keeper of your relationships'
heartbeat, not just one-off plans. **Effort:** M. **Risk:** scheduling
inference needs calendar access to be great.

## 2. Third-Party Matchmaker 🤝
A mutual friend can propose a hang between two people ("You two would love
each other - coffee?"). Both get a private invitation; it's revealed only if
both accept. Mutual Mode, but with a human serendipity engine.
**Why:** solves cold-start between strangers using existing trust. **Effort:**
S-M (reuses the mutual-intent machinery). **Risk:** must be rate-limited to
stay special.

## 3. Social Battery Pacing 🔋
Optional private energy tracking: after events you log a one-tap "that filled
me up / drained me." Switchboard learns your social rhythm and gently shapes
suggestions ("you've had a packed week - want Quiet Company instead?").
**Why:** deepens the "permission" brand - permission to rest, too. **Effort:**
M. **Risk:** must never feel like surveillance; strictly private + deletable.

## 4. Open Table 🍽️
A confirmed event with spare seats can be published to your extended network
(friends-of-friends who share interests): "2 seats left at game night."
Cascades handle the fill automatically.
**Why:** turns every event into a community-growth loop. **Effort:** M.
**Risk:** hosts need strong controls; FoF trust boundary must be explicit.

## 5. Reconnection Radar 🧭
Private-only insight: "You and Jordan haven't seen each other in 3 months -
you used to bike together." One tap opens Mutual Mode pre-filled. Never
visible to the other person, never a public streak.
**Why:** the app's most emotionally valuable nudge; fights friendship decay.
**Effort:** S. **Risk:** tone; must feel like a friend's nudge, not a KPI.

## 6. Post-Event Memory Capsules 📦
24h after an event, the Living Room asks everyone for one photo + one line.
It composes a beautiful shareable capsule page (the event's OG design
language) that lives in the room forever.
**Why:** memories are the retention story; capsules are organic marketing.
**Effort:** M. **Risk:** participation drop-off - needs to work with 1 photo.

## 7. Venue Partnerships & Perks 🏪
Local businesses claim their venue; groups that confirm a Switchboard plan
there get a perk (reserved table, 10% off a pitcher). Businesses see only
aggregate demand ("6 groups planned here this month").
**Why:** the revenue model - B2B pays, consumers never do. **Effort:** L.
**Risk:** requires ops/sales; start with 5 hand-picked venues.

## 8. Voice-First Planning 🎙️
"Hey Switchboard: coffee tomorrow morning, try Alex first, then Jordan, then
Mia, 20-minute windows." One utterance → parsed cascade draft to confirm.
Claude does the parsing; the wizard becomes the fallback, not the default.
**Why:** the fastest possible path from impulse → plan; huge demo wow.
**Effort:** M (structured-output parsing is v1-adjacent). **Risk:** parsing
errors erode trust - always show the draft before sending.

## 9. Household & Group Accounts 🏡
A "household" entity (family, roommates) that can host events, hold a shared
Living Room, and receive invitations as a unit ("the Taggarts are in").
Weighted Input gets family-mode defaults (kids get votes!).
**Why:** unlocks the family scenarios your spec leads with; distinct from
every competitor. **Effort:** L (touches identity model). **Risk:** permission
complexity.

## 10. Serendipity Zones for Organizers 🎪
Conferences, cruises, campuses, and festivals get a claimable "zone": a
branded Shared Moments space with organizer-curated experiences ("AI Ethics
BOF", "Deck 4 Chess"). Attendees who opt in get zone-scoped matching.
**Why:** B2B2C distribution - one conference = thousands of installs with
perfect context. **Effort:** L. **Risk:** needs an organizer dashboard; sell
it as "icebreakers that actually work."

---

### Suggested sequencing
**Now-ish (S/M, pure product):** 5 Reconnection Radar → 2 Third-Party
Matchmaker → 8 Voice-First → 1 Standing Rituals.
**After traction:** 6 Capsules → 3 Battery → 4 Open Table → 9 Households.
**Business track (parallel):** 7 Venues → 10 Zones.
