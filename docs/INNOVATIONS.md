# Switchboard: Ideas for the Next Wave

Only unshipped ideas live here. The authoritative catalogue of what exists is
[`src/lib/features.ts`](../src/lib/features.ts); when an idea ships, remove it
from this file. The original idea numbers remain stable because archived plans
refer to them.

Here are 13 open ideas, grouped by theme. Each has a rationale, rough effort
(S/M/L), and the main risk.

---

## Making plans sturdier

### 1. Weather Guardian
Outdoor plan and the forecast turns? Switchboard notices two days out,
quietly asks the host "want a backup?", and can run a quick private poll
for plan B without a single panicked group text.
Why: rain kills more plans than rejection does. Effort: M. Risk: forecast
API dependency; only trigger on high confidence.

### 3. Flake Insurance
When someone cancels late, Switchboard instantly offers the seat to the
waitlist, then to the next queued invitee, with a "last-minute seat" frame
so the short notice feels like an invitation, not an afterthought.
Why: late cancellations are the biggest source of dead plans. Effort: S-M.
Risk: tone; the copy has to make short notice flattering.

### 5. Cascade Coach
Private post-plan analytics for hosts: which windows expired, where the
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

### 10. Surprise Mode
Plan a birthday inside the guest of honor's own friend group: one member is
marked hidden, sees nothing, while everyone else coordinates normally. On
the day, the plan reveals itself to them.
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
data; strictly opt-in and visible only to hosts of plans you join.

### 13. Battery Pacing
Social Battery today feeds only the energy map in Your Read. Pacing would let
it steer what Switchboard offers next: fewer nudges, smaller plans, and
quieter suggestions while the battery is low, and more when it is full.
Why: the setting already exists and people expect it to do something beyond
the chart (D26 in the completion plan). Effort: M. Risk: it must never tell
anyone else your battery is low, and it must not hide an invitation.

### 14. Matchmaker Hints
Switchboard privately notices that two of your friends share three
interests and have never been at the same plan, and suggests you introduce
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
A year after a capsule-worthy plan, the room softly resurfaces it: "One
year ago tonight." One tap starts another plan with the same people.
Why: memories are the moat; anniversaries are their interest payments.
Effort: S. Risk: skip anniversaries of plans with departed members.

---

## Suggested sequencing

Quick wins first: Arrival Mood, Handle Cards, Anniversary Rewind.
Then the sturdiness pass: Flake Insurance, Weather Guardian, Cascade Coach.
Then logistics: Carpool Threads and Surprise Mode.
Long arcs: Matchmaker Hints, Plus-One Chains, Comfort and Access Preferences,
Travel Overlap, and Seasons Recap.
