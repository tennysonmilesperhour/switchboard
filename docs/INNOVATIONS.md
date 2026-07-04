# Switchboard: 20 Ideas for the Next Wave

The first two waves have shipped: the 10 launch innovations (guest links,
cascade simulator, teaching declines, smart windows, circles, consensus
meter, calendar export, quiet hours, OG images, PWA push) and the 10 bold
ideas (Standing Rituals, Third-Party Matchmaker, Social Battery, Open Table,
Reconnection Radar, Memory Capsules, Venue Perks, Voice-First Planning,
Households, Serendipity Zones).

Here are 20 more, grouped by theme. Each has a rationale, rough effort
(S/M/L), and the main risk. None are built yet.

---

## Making plans sturdier

### 1. Weather Guardian
Outdoor plan and the forecast turns? Switchboard notices two days out,
quietly asks the host "want a backup?", and can run a lightning AWI poll
for plan B without a single panicked group text.
Why: rain kills more plans than rejection does. Effort: M. Risk: forecast
API dependency; only trigger on high confidence.

### 2. Run It Back
One tap on any past event: same people, same place, new date. The cascade
re-fires in the same order, minus anyone who said "not my thing".
Why: the best predictor of a good plan is the last good plan. Effort: S.
Risk: none worth naming; this should exist already.

### 3. Flake Insurance
When someone cancels late, Switchboard instantly offers the seat to the
waitlist, then to the next queued invitee, with a "last-minute seat" frame
so the short notice feels like an invitation, not an afterthought.
Why: late cancellations are the biggest source of dead plans. Effort: S-M.
Risk: tone; the copy has to make short notice flattering.

### 4. Co-Hosts
Two or more people share host powers: editing the cascade, approving Open
Table requests, closing polls. Great for couples and event pairs.
Why: real plans usually have two organizers. Effort: M. Risk: permission
model complexity.

### 5. Cascade Coach
Private post-event analytics for hosts: which windows expired, where the
cascade stalled, what window lengths actually get answered in your circle.
Feeds better defaults next time.
Why: the product should learn plan mechanics so users never think about
them. Effort: M. Risk: must stay private and advisory, never gamified.

## Logistics that vanish into the Living Room

### 6. Carpool Threads
A Living Room tab where drivers offer seats, riders claim them, and pickup
order sorts itself. Addresses pull from the room's Places.
Why: "who's driving" is the last group-text holdout. Effort: M. Risk: none
serious; keep it text-based, no live location in v1.

### 7. Split the Bill
Log shared costs in the room, see who owes what, settle with a Venmo or
PayPal link. No money moves through Switchboard.
Why: money awkwardness is social friction, which is the whole mission.
Effort: M. Risk: scope creep toward payments; stay a ledger.

### 8. Availability Heatmap
For hard-to-schedule groups: everyone paints their free times on a shared
week grid, and the overlap glows. The host taps the brightest block and the
event is scheduled.
Why: date-picking is the slowest part of group planning. Effort: M.
Risk: needs a great mobile paint interaction to beat Doodle-style tools.

### 9. Calendar Sync
Optional read-only Google Calendar link: free/busy powers smarter response
windows, ritual timing, and heatmap prefills.
Why: multiplies the intelligence of everything above. Effort: L. Risk:
OAuth scopes and trust; must be transparently read-only.

### 10. Surprise Mode
Plan a birthday inside the guest of honor's own friend group: one member is
marked hidden, sees nothing, while everyone else coordinates normally. On
the day, the event reveals itself to them.
Why: surprise parties are the ultimate coordination problem. Effort: M.
Risk: a leak would be catastrophic for trust; needs careful RLS work.

## Softer signals between people

### 11. Arrival Mood
An optional note on your RSVP: "in, but running on fumes". The host sees
it, the group calibrates, nobody has to perform energy they don't have.
Why: extends Social Battery from private to gently shared. Effort: S.
Risk: keep it one-tap and optional or it becomes homework.

### 12. Comfort and Access Preferences
Profile-level needs (step-free, quiet spaces, dietary, no late nights)
surfaced to hosts at planning time and to Discovery as filters.
Why: inclusion is a feature, not a checkbox. Effort: M. Risk: sensitive
data; strictly opt-in and visible only to hosts of events you join.

### 13. Sabbatical Mode
One switch: pause signals, radar, rituals, and matchmaking. Friends who
try to reach you see "taking a quiet season" instead of silence.
Why: permission to rest is part of permission to connect. Effort: S.
Risk: none; this is the brand.

### 14. Matchmaker Hints
Switchboard privately notices that two of your friends share three
interests and have never been at the same event, and suggests you introduce
them. You stay the matchmaker; the app just hands you the idea.
Why: seeds the matchmaker loop with zero cold-start effort. Effort: M.
Risk: must feel like insight, not surveillance; interests only, no
message-content analysis.

## Growing the graph naturally

### 15. Plus-One Chains
Hosts can allow each acceptee to bring one person from their own circles,
capped by capacity. The chain is visible to the host as it grows.
Why: parties grow through friends-of-friends; this makes it orderly.
Effort: M. Risk: host control is everything; default off.

### 16. Handle Cards
A QR code on your profile that adds you in one scan, plus a pocket-sized
share card for texts. Meeting someone IRL becomes a two-second add.
Why: the add-a-friend flow is the top of every funnel. Effort: S.
Risk: none.

### 17. Neighborhood Boards
A permanent, geofenced zone for a neighborhood: recurring open events
(Saturday market walk, pickup basketball), availability signals scoped to
neighbors, and a shared board room.
Why: the strongest use case for local community is repetition, not
one-offs. Effort: L. Risk: moderation; start invite-only per board.

### 18. Travel Overlap
Share upcoming trips (city plus date range). When a friend's trip overlaps
yours, you both get a quiet note: "You two are both in Chicago March 3-6."
Why: the saddest sentence is "I didn't know you were in town". Effort: M.
Risk: location sensitivity; city-level only, friends only.

## Keeping the story

### 19. Seasons Recap
Four times a year, a private recap: who you saw, what you did, which
rituals held, plus one shareable capsule-style card if you want to post it.
Why: reflection drives retention better than streaks. Effort: M.
Risk: must celebrate, never guilt; no counts of declined invites.

### 20. Anniversary Rewind
A year after a capsule-worthy event, the room softly resurfaces it: "One
year ago tonight." One tap runs it back (see idea 2).
Why: memories are the moat; anniversaries are their interest payments.
Effort: S. Risk: skip anniversaries of events with departed members.

---

## Suggested sequencing

Quick wins first: 2 Run It Back, 16 Handle Cards, 13 Sabbatical Mode,
11 Arrival Mood, 20 Anniversary Rewind.
Then the sturdiness pass: 3 Flake Insurance, 1 Weather Guardian, 5 Cascade
Coach, 4 Co-Hosts.
Then logistics: 8 Heatmap, 6 Carpool, 7 Split the Bill, 10 Surprise Mode.
Long arcs: 9 Calendar Sync, 14 Matchmaker Hints, 15 Plus-One Chains,
12 Comfort Prefs, 18 Travel Overlap, 17 Neighborhood Boards, 19 Seasons
Recap.
