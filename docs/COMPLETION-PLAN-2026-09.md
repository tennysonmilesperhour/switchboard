# Switchboard completion plan

Written 2026-09-29 from a feature-by-feature audit of every entry in
`src/lib/features.ts`, plus checks of production (Vercel deployments, runtime
errors, environment) and the database (Supabase security and performance
advisors). Each feature was traced from its screen to its server action, its
database rules, and the notifications it promises.

**Where things stand.** Every catalogued feature exists and its main path
works; production is current and reported no runtime errors in the past seven
days. What remains is features that stop partway, promises in copy that the
code does not keep, and failures that look like empty screens. The audit fixed
about 60 small issues directly (PRs #222 and #223); everything below is what is
left.

**How to use this.** Work top to bottom. Each step says what is wrong, what
"done" means, a size (S under an hour, M under a day, L more than a day), and
whether it needs a decision from you first. Decisions are collected in the
first section with a recommended answer, so one pass through that list unblocks
most of the plan. Steps are ordered by how incomplete the feature is, with
safety and data-loss problems pulled to the front of their tier.

Totals: 11 partially built features, 49 working-with-gaps items, 4 scale and
quality items, and 8 owner actions. By size: 28 small, 7 small-to-medium, 24
medium, 1 medium-to-large and 4 large.

---

## 1. Decisions needed (with a recommendation)

| # | Question | Recommendation | Unblocks |
|---|---|---|---|
| D1 | Who can be made a co-host: any handle, or only connections and invitees? | Connections and invitees only. | P1 |
| D2 | Should a guardian-approval RSVP be held as pending until approved (new status, does not take a seat)? What may a guardian see? | Yes, hold as `pending_approval`, no seat until approved. Guardian sees plan title, time, place, host name, and who RSVP'd. | P2 |
| D3 | The "show invite list" and "show expired" toggles do nothing. Build them or remove them? | Build `show_invite_list` (guests see who else is invited); remove `show_expired`. | P3 |
| D4 | What do email and phone guests receive when a plan starts as a date poll? | The share link with "help pick the date", once, at creation. | P4 |
| D5 | When a date poll is decided, what start time does a band like "Friday evening" mean, and what about free-text ideas? | Band start (evening = 6pm) in the plan's zone; free text prompts the host to set the time before sending. | P5 |
| D6 | Where does a sabbatical note appear, and should sabbatical mute non-urgent notifications? | On the public profile and in the invite picker; yes, mute everything except direct messages from plans you are already in. | P6 |
| D7 | What can a moderator actually do? Should a room-message report attach the message? | Suspend account, remove a board post or room message, attach the reported message. | P7 |
| D8 | Rituals: remind both people when due, and what does "skip" record? | Push both on the due day; skip moves the due date one cadence ahead. | P8 |
| D9 | Households: does picking one member select the whole set, or should the copy change? | Picking the household chip selects all; picking one member does not. Change the copy. | P9 |
| D10 | Private zones: tell a denied requester, and may they ask again? | Tell them, and allow one new request after 30 days. | P10 |
| D11 | Shared moments: match on zone, on distance, or on the typed name? | Zone when checked into one, otherwise within 200 m. | P11 |
| D12 | After a block, what happens to a room you share with that person? | Match rooms (two people) become read-only for both; group rooms stop notifications between the pair. | G1 |
| D13 | Should browsing people discovery require being discoverable yourself? | Yes, as the feature index already promises. | G5 |
| D14 | Partner perks: global or city-scoped list, and how does a claimant appeal? | City-scoped by the viewer's area; appeal by replying to the review email. | G6 |
| D15 | When SMS stops being deliverable, reset an "SMS only" route or keep it and warn? | Reset to "existing" and show a note in Settings. | G7 |
| D16 | Daily digest: which kinds are batched, does the digest hour beat quiet hours, and should it fall back to email? | Batch everything except plan changes and direct invites; digest hour beats quiet hours; fall back to email. | G8 |
| D17 | May a host extend the live response window? May someone who declined change their answer? | Yes to both while the plan is inviting. | G18 |
| D18 | Which plan fields become editable after creation? | Cover, questions (add only), reminders, theme, Open Table. Keep parental approval and recurrence fixed. | G19 |
| D19 | Should Run it back open as a date poll? | Yes. | G24 |
| D20 | Rooms: what do "leave" and "mute" mean for a plan's room? | Mute: no notifications. Leave: only for match rooms and ended plans. | G27 |
| D21 | Split the bill: choose payer and participants, show who owes whom? | Yes to both; keep USD for now. | G28 |
| D22 | Should "Ignore" on a friend request stick? | Yes, hide their requests for 90 days. | G31 |
| D23 | Zones: when does a zone stop being "active", and how are zones found? | End date set by the organizer (default 7 days); search plus "near me". | G35 |
| D24 | Map: show upcoming plans only on the Plans layer? | Yes. | G37 |
| D25 | Discovery without AI: what should the reader see? | "Tailored ideas are unavailable right now; here are a few starters", never a mention of API keys. | G38 |
| D26 | Social battery: build pacing, or change the copy? | Change the copy now; pacing goes on the roadmap. | G40 |
| D27 | Username-only accounts: ask for a recovery email during onboarding, or a banner in Settings? | Optional step in onboarding plus a Settings banner. | G42 |

---

## 2. Owner actions (dashboards, not code)

| # | Action |
|---|---|
| O1 | Supabase → Authentication → Password security: enable leaked-password protection (still off). |
| O2 | Confirm the Vercel plan supports the every-minute cron in `vercel.json` (`/api/cron/cascade`). If it does not, reminders, SMS and email-route jobs only run once a day. |
| O3 | Optional environment variables not set in production: `OBSERVABILITY_WEBHOOK_URL` (ops alerts), `POSTHOG_API_KEY` and `POSTHOG_PROJECT_ID` (readable stack traces), `SCOPE_WATCH_EMAIL` (checklist notices). |
| O4 | `ADMIN_EMAILS` is set in production but no code reads it. Remove it, or say what it was meant to do. |
| O5 | Twilio: point the inbound and status webhooks at the app, enable Advanced Opt-Out, and run the live STOP/START check in `docs/DEPLOYMENT.md`. |
| O6 | Supabase Google provider: confirm the redirect URL is `/auth/callback` on the production domain. |
| O7 | Set a GitHub Actions spending limit so exhausted minutes cannot silently stop CI again. |
| O8 | The profile "Message" button now says "Down to connect", because it opens Mutual, which sends nothing unless the other person picks you back. Say if you want the old label. |

---

## 3. Partially built features (most incomplete first)

| # | Feature | What is wrong | Done when | Size | Decision |
|---|---|---|---|---|---|
| P1 | Co-hosts | `can_view_event` only covers the host and invitees, so a co-host without an invite is bounced to `/join` and cannot use any host control. Co-hosted plans are missing from `/plans` and the calendar feed; adding a co-host sends no notification. | A co-host can open the plan and use every host control; co-hosted plans list in `/plans` and the calendar feed; the new co-host is notified. Migration plus pgTAP. | M | D1 |
| P2 | Parental approval | An RSVP counts immediately; approval only cancels it on denial. The in-app RSVP never asks for a guardian. The host cannot see RSVPs that never gave a guardian email. The guest step is lost if the tab closes. "We've emailed the guardian" shows even when the email failed. `/approve` does not say who or when. | Approval gates the RSVP on every path; the host sees everyone awaiting approval; the email result is reported honestly; the guardian page shows who, what and when. | L | D2 |
| P3 | Privacy and access | `show_invite_list` and `show_expired` are stored and toggled but read nowhere. | Each toggle changes what a guest sees, with a test proving it, or the toggle is gone. | M | D3 |
| P4 | Deciding together | Creating a date-poll plan notifies nobody. Follow-up polls only nudge accepted guests and the host, not the queued voters. The wizard cannot add options though `/create` promises "float a few options". A poll closing at its deadline tells nobody, including a host who must pick. | Voters hear when a poll opens, when a follow-up opens, and when a poll closes; the host is told when it is their pick; the wizard can seed options. | M | D4 |
| P5 | The decided date | Neither the poll runner nor "Choose this" writes the winning date to the plan, so it stays "Time TBD" with no calendar links or reminders, and "The date is set" goes out with no date. A poll closed with no suggestions leaves the host nothing to pick. | Deciding a date sets `starts_at` in the plan's zone (or asks the host for a time); "Send the invitations" requires a date; an empty poll offers the host a way to set one. | M | D5 |
| P6 | Sabbatical mode | The note is never shown to anyone. Notifications, Mutual and invitations are not paused. | The note appears where D6 says, and the pauses match the Settings copy. | M | D6 |
| P7 | Moderation | "Mark actioned" only records a status; there is no way to suspend, remove a post or remove a message in the app. A room-message report carries only the profile. | Moderators can act from `/moderation`, and reports attach what was reported. | L | D7 |
| P8 | Standing rituals | Nothing reminds anyone when a ritual is due; "skip" does not exist. | Both people are reminded on the due day and can skip. | M | D8 |
| P9 | Households | Members cannot be added or removed after creation; "inviting one invites the set" only happens through the wizard chip. | Members are editable; the copy matches the behaviour. | M | D9 |
| P10 | Private zones (remaining) | A denied or removed requester sees "Ask to join" again, asks, is told "Asked", and nothing happens (the old row blocks a new one). Members have no Leave button. | Requesters see their real status and can ask again per D10; members can leave. | S-M | D10 |
| P11 | Shared moments | Live updates never fire (the tables are not in the realtime publication, and owner-only RLS means a publication alone would not deliver other people's check-ins). Matching still keys on the typed place name outside zones. | New nearby check-ins and curiosity appear without reloading (a notification-driven refresh, not raw table realtime); matching uses D11. | M | D11 |

---

## 4. Working, with gaps

### 4a. Safety, privacy and data loss (do these first)

| # | Item | Done when | Size | Decision |
|---|---|---|---|---|
| G1 | A block does not reach rooms you share: a blocked person can keep messaging you, and you keep getting notified. | Rooms follow D12, with pgTAP. | L | D12 |
| G2 | Room photos are uploaded to the public media bucket, so anyone with the URL can see them (breaks the media-privacy rule in `docs/SECURITY.md`). | Room photos use private storage and signed URLs. | M | |
| G3 | Split the bill's insert policy does not restrict `payer_id`, so a member can log an expense as someone else. | Policy pins the payer (or D21's chosen payer rules), with pgTAP. | S | |
| G4 | Settings renders defaults when the profile read fails, and a later Save writes those defaults over real values. | A failed read shows an error with a code and blocks saving. | S | |
| G5 | People discovery: the index promises you must be discoverable to browse, but browsing is open; "Nearby" never compares locations; interest cannot be withdrawn; cards have no profile link or block. | Behaviour matches D13 and the copy; cards link and can block. | M | D13 |
| G6 | Partner perks: the list is the 10 newest worldwide; the reviewer's note never reaches the claimant; no edit, withdraw or claim rate limit. | List follows D14; claimants hear the outcome; claims are rate-limited. | M | D14 |
| G7 | Rate-limited contact import says "No contacts matched". | Throttling says so, with its code, in all three callers. | M | |
| G8 | Reconnection radar can suggest someone you give space to. | Radar skips people you give space to. | S | |

### 4b. Notifications that do not arrive

| # | Item | Done when | Size | Decision |
|---|---|---|---|---|
| G9 | "SMS only" goes silent when SMS is turned off, the plans category is unticked, STOP is sent, or the phone changes. | Route follows D15; Settings warns. Migration. | M | D15 |
| G10 | Daily digest: individual pushes still fire when it is on; it is push-only; the digest hour can fall inside quiet hours; it is marked sent before the push goes out. | Behaviour follows D16; a failed digest is retried, not lost. | M | D16 |
| G11 | Tapping a push notification can do nothing when the app window is not controlled by the service worker. | Tapping always focuses or opens the right page. | S | |
| G12 | The rooms inbox stops updating live after the first message; ticked tasks and expenses do not update live. | Inbox and room lists update live for updates as well as inserts. | M | |
| G13 | Quiet hours use a timezone set once at onboarding that cannot be seen or changed; the copy says notifications "wait for you" but pushes are dropped. | Timezone is visible and editable; copy matches. | S-M | |
| G14 | The email route says "arrives immediately" but runs on the cascade cron. | Copy matches the real cadence (see O2). | S | |

### 4c. Failures that look like empty screens

| # | Item | Done when | Size |
|---|---|---|---|
| G15 | Home ignores errors on about 17 reads, so a failure looks like "nothing here". | Each failed read shows an ErrorNotice with a code. | M |
| G16 | `/notifications` shows "You're all caught up" on a failed read; only the newest 20 show. | Errors show a code; older notifications can be loaded. | S |
| G17 | Discover's people lookup failure reads as "No one in this lane yet". | Shows the failure with a code. | S |
| G18 | The cascade runner drops an error from `apply_cascade_updates`. | The error is logged with a code and retried by the next tick. | S |

### 4d. Plans and polls

| # | Item | Done when | Size | Decision |
|---|---|---|---|---|
| G19 | Availability grid slots are UTC bands but calendar busy blocks are real instants, so "Fill from my calendar" marks the wrong bands away from UTC. | Slots are generated in the plan's zone. | M-L | |
| G20 | Open Table: declining a request deletes it silently though `/join` promises "you'll hear back either way"; requesters cannot see a pending request; co-hosts are not told; `open_table` cannot be changed later. | Requesters hear back and can see pending requests; co-hosts are notified. | S-M | |
| G21 | Response windows: only queued invites can be edited, so the live window cannot be extended; an in-app invitee who declined can never change their answer. | Per D17. | S-M | D17 |
| G22 | The edit form cannot change cover, questions, reminders, parental approval, recurrence, theme or Open Table. | Per D18. | M | D18 |
| G23 | The link preview ignores the plan's cover image. | The OG image uses the cover when the plan is shareable. | S | |
| G24 | Question answers are grouped by display name, so two guests with the same name merge. | Grouped by invite. | S | |
| G25 | Reminder copy says "a few hours ahead"; the real schedule is day-before plus starting-soon. The toggle cannot be changed after creation. | Copy matches; toggle editable (with G22). | S | |
| G26 | "Describe it for me" resolves "tomorrow"/"tonight" against the server's UTC date; the example promises response windows it does not parse. | Uses the host's local date; example matches. | S | |
| G27 | Run it back: a failed clone redirects with no message; the clone goes live with no date or poll; co-hosts are not carried over; insert errors are ignored. | Failures show a code; clone follows D19. | S | D19 |
| G28 | Memory capsule: anyone who can view the plan can add lines, including people who declined. | Only people who went (and the hosts) can add. | S | |
| G29 | `/plans`: waitlisted invites appear under "Going"; Open Table requests are missing. | Each shows in its own section. | S | |

### 4e. Rooms and people

| # | Item | Done when | Size | Decision |
|---|---|---|---|---|
| G30 | Rooms: no member list or header, no link back to the plan, no leave or mute, no delete-own-message (the database allows it), no "load earlier" past 200 messages, and the inbox reads only the newest 1000 messages across all rooms. | All present; inbox reads per room. | M | D20 |
| G31 | Split the bill: only yourself as payer, only your own net shown, no "settled", USD only. | Per D21. | M | D21 |
| G32 | Chat that files itself: without AI only links, addresses and tasks are filed and the UI does not say why; addresses are US-only. | The Notes tab explains the fallback. | S | |
| G33 | Voice notes: an unsupported browser shows nothing; a recorder error leaves the microphone open. | Explains unsupported browsers; releases the mic on error. | S | |
| G34 | Your people: no search; rows do not link to profiles; "Ignore" lets the same person ask again at once. | Search and links; Ignore per D22. | S | D22 |
| G35 | Give space has no list of everyone you give space to. | A list with "stop giving space". | S | |
| G36 | Public profile: no copyable `/u/<handle>` link; a bare "@" when the handle is empty. | Both fixed. | S | |
| G37 | Mutual has no way to unmatch. | Unmatch exists. | S | |

### 4f. Places

| # | Item | Done when | Size | Decision |
|---|---|---|---|---|
| G38 | Zones: the list is the 20 newest public zones worldwide with no search, "near me" or end date; organizers cannot rename, edit, delete or promote a moderator. | Per D23; organizer tools exist. | M | D23 |
| G39 | Boards: no leave, rename or delete; no co-moderators (no update policy, so a board is orphaned if its moderator leaves); "Can help: Alice" gives no way to reach Alice; only the newest 50 posts; post actions are about 22 px tall. | All present, with 44 px targets. | M | |
| G40 | Map: the Plans layer includes past and declined plans; tiles and geocoding are hard-coded public services with no app-wide throttle, and an outage reads as "Couldn't find N addresses"; moments geocode by bare name; one-finger panning traps page scroll on phones. | Per D24; configurable providers with a global throttle; outages show a code; two-finger pan on touch. | M | D24 |
| G41 | Discovery without AI tells readers to "connect an Anthropic key"; AI failures are swallowed unlogged; the fallback ignores budget, vibe and interests; inputs have no server-side length limits. | Per D25; failures logged with `SB-DISCOVERY-RUN`; inputs capped. | S | D25 |
| G42 | Live location: the radius can only be chosen before sharing and is not remembered; a failed nearby poll is silent. | Radius editable and remembered; failures shown. | S | |

### 4g. You, settings and the app shell

| # | Item | Done when | Size | Decision |
|---|---|---|---|---|
| G43 | Social battery promises it "paces what Switchboard suggests next"; nothing reads it except Your Read. | Per D26. | S | D26 |
| G44 | Offline: an in-app tap while offline shows the crash page; the static cache is never pruned; the manifest and icons never refresh. | Offline taps show the offline page; cache pruned on activate; manifest and icons refresh. | M | |
| G45 | Account recovery: username-only accounts are never asked for a recovery email (AUTH.md open decision); username sign-in without the service-role key tries a fake address; `/auth/confirm` drops `next` on a failed link. | Per D27; `SB-CONFIG-AUTH` for the missing key; `next` preserved. | S-M | D27 |
| G46 | The update toast covers the Settings save bar, and tapping Update can drop unsaved edits. | The toast uses the bottom overlay slot. | S | |
| G47 | Google sign-in errors on `/login` have no codes. | Each has an `SB-AUTH-OAUTH` code. | S | |
| G48 | `localStorage` calls in ShowTipsAgain and HostSuggestions are unguarded and throw where storage is blocked. | Wrapped in try/catch. | S | |
| G49 | The notifications card mixes three save models (save bar, separate Save buttons, immediate saves), and SMS and channel edits are not covered by the leave-page warning. | One save model. | S-M | |

---

## 5. Scale and quality

| # | Item | Done when | Size |
|---|---|---|---|
| Q1 | 119 row-level policies call `auth.uid()` per row (Supabase advisor `auth_rls_initplan`). | Rewritten as `(select auth.uid())`; advisor clear. | M |
| Q2 | 57 foreign keys have no covering index. | Indexes added for the ones on hot paths; advisor reviewed. | S-M |
| Q3 | Four tables have two permissive SELECT policies for the same role. | Merged into one policy each. | S |
| Q4 | Test coverage. No end-to-end tests touch Explore, the map, zones, moments or boards; none cover fresh-account onboarding, sign-up, password reset, legal update, account deletion, a cascade window expiring, a poll closing, or co-host controls. No unit tests for `cascade-runner`, `availability`, `announcements`, `event-clone`, `capsules`, `event-page`, `live-location`, `matchmaker`, `households`, `moderation`, `matches`, `relationship`. No pgTAP for rituals, households, expenses, or room messages under blocks. | Each listed flow has a test at the right level; add them alongside the step that changes the flow. | L |

---

## 6. Suggested milestones

1. **Trust and safety** (about a week): O1, G1 to G4, G9, G11, P10, and the rest of 4a.
2. **Finish the partial features**: P1, P4, P5, then P2, P3, P6. P1 unblocks several plan items.
3. **Complete people, rooms and places**: P7 to P9, P11, G30, G31, G38 to G40, G5, G6.
4. **Polish sweep**: the remaining S items, grouped by area so each lands as one PR.
5. **Scale and tests**: Q1 to Q4.

After milestone 5, every feature in the index does what it says.

---

## 7. Roadmap (not required for "finished")

These are new features, not gaps in shipped ones. They stay in
`docs/INNOVATIONS.md` and `docs/DOCKET.md` until you choose them.

- **INNOVATIONS.md** (13 ideas): Weather Guardian, Flake Insurance, Cascade
  Coach, Carpool Threads, Surprise Mode, Arrival Mood, Comfort and Access
  Preferences, Matchmaker Hints, Plus-One Chains, Handle Cards, Travel Overlap,
  Seasons Recap, Anniversary Rewind.
- **DOCKET.md in design**: custom answers on every preset picker, zone
  announcements gated to people present, a Moments filter system, context on
  connect requests, "confirmed in theory" soft yeses, self-serve verified
  communities, the host-private "these two don't mix" note, get-to-know-you
  games, businesses in Explore.
- **DOCKET.md queued**: consequence-aware actions for live invites ("skip to
  next", "cancel this one"); a "here's what I understood" step for
  "Describe it for me".
- **The visual epic**: opt-in public plans, a proximity-of-willingness control,
  the two-stream dashboard, Map/List/Surprise-me lenses, image themes, the
  adventure game, and Adventure Mode for zones.
