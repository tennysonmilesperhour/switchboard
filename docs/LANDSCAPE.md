# The social connection landscape

A design, strategy, product, marketing, voice, psychology and code brief for
Switchboard. Prepared 2026-10-17 from seven research passes and a read of this
repository at `3c17f65`.

**What this is for.** Switchboard sits in a crowded field: invite pages
(Partiful, Luma, Apple Invites), stranger dinners (Timeleft, 222, Pie), interest
groups (Meetup, run clubs), social calendars (Howbout, Saturn), presence maps
(Zenly, Snap Map) and close-friends apps (Locket, BeReal). Each of them solved
one part of social connection well and failed at another in a way that is now
on the record. This brief collects what each one teaches, so that every design,
copy, product and engineering decision in this repo can take the best of them
while staying specialised in the one thing Switchboard does that none of them
do.

**How to read it.**

- Section 0 is the whole argument on one page.
- Sections 1 to 3 are the field: where Switchboard stands, the map, and a
  teardown of every product that matters.
- Section 4 is the evidence from psychology and sociology that the product
  should rest on.
- Sections 5 to 11 are the brief proper: strategy, product, design, voice,
  marketing, code and metrics.
- Section 12 is the checklist an agent or contributor runs before shipping a
  social surface. `AGENTS.md` points here.

**Confidence.** Every fact in this brief traces to a research memo in
[`landscape/`](landscape/), where each claim carries a tag ([V] verified with a
URL, [V-corrected], [K]/[R]/[BG] from model memory, [U] conflicting) and a
verification pass dated 2026-10-17. Page fetching failed during research, so
"verified" means confirmed in search-result extracts of the cited source.
Figures marked *(company claim)* are self-reported. Figures marked
*(unverified)* did not survive a recheck and must not go into a deck or public
copy without a primary source.

---

## 0. The answer on one page

**The field splits two ways.** Every funded friends-side tool (Partiful, Apple
Invites, Luma, Posh) is **broadcast and host-centric**: one link to everyone, a
visible guest list, social proof as the sales pitch. Every funded
**group-centric, targeted** product (Timeleft, 222, Pie) is about
**strangers**: an algorithm picks the table. The remaining quadrant, **people
you already know, asked selectively, deciding together**, is occupied by one
product: the group chat. That is where plans die. Nobody wants to be the one
who asks, "who's in?" exposes the people who are not, and the fourth person
invited knows they were fourth.

**Switchboard's specialisation is asking without exposure.** Cascading invites,
private group decisions, decline reasons nobody else sees, mutual interest that
never reveals a one-sided yes, and give space. Each of these lowers the social
cost of one act: asking, answering, deciding, wanting to see someone again. The
research in section 4 says that cost is the real reason plans do not happen:
people underestimate how much others want to hear from them (Liu et al. 2022),
overestimate how much a no will hurt (Givi and Kirk 2023), underestimate how
much a new acquaintance liked them (Boothby et al. 2018), and say yes to things
they do not want to do because refusing is awkward (Flynn and Lake 2008). No
competitor is built on that body of evidence. Switchboard is.

**The market is converging on Switchboard's ground from both sides.**

- The stranger apps have conceded that the dinner is acquisition and the second
  meeting is the product: Timeleft built Repeat and now auto-connects every
  table after dinner, 222 raised its Series A on "maintaining relationships",
  Pie pivoted in August 2026 to permanent "Community Homes", and Bumble rebuilt
  BFF around groups.
- The invite apps are moving into mutual signals: Partiful shipped **Crush**
  (December 2025), private picks among co-attendees revealed only when mutual.

Switchboard already owns the consent architecture both sides are reaching for.
The window to be known for it is open now and will not stay open.

**The ten decisions that matter most**, in order:

1. **Lead with the asking problem, everywhere.** The landing page says "Make
   plans. Like magic." and names none of the mechanics. The cascade is opt-in
   on wizard step 3 behind a default described as "the right choice for most
   plans". Make the differentiator the first thing a visitor and a host meet
   (section 6.1, 8.4).
2. **Let anyone answer the shared link in seconds.** Today the link a host
   pastes into a group chat (`/i/<token>`) needs a full account, email
   confirmation, a handle and two rounds of legal checkboxes before a guest can
   say yes. Partiful, Luma and Apple Invites all answer in under three taps.
   This is the single largest competitive gap (section 6.1).
3. **Let a plan exist with nobody on it yet.** The wizard refuses to continue
   without a named invitee, which blocks the "drop a link in the group chat"
   pattern that drives every competitor's growth (section 6.1).
4. **Grow the graph from plans that happened, with consent.** After a plan, ask
   each attendee privately whether they would do it again with each person.
   Reveal only mutual yeses. This closes the liking gap, feeds Mutual, rituals,
   matchmaker and reconnection radar, and is the one loop the stranger apps
   would build if they had Switchboard's privacy model (section 6.2).
5. **Make standing rituals the retention engine.** Run clubs, Timeleft
   Wednesdays and every durable Meetup group work because of a fixed time and
   place that happens unless cancelled. Hall's hours-to-friendship numbers say
   only recurrence gets people there (section 6.2).
6. **Gate everything that needs density.** Zones, moments, people discovery,
   the live map and the dating and networking lanes are worthless at low
   density and carry the most trust and safety risk. Show them only where a
   neighbourhood, campus or ritual has crossed a threshold (section 5.2).
7. **Keep guests free forever, never sell attention or anonymity, and say so.**
   Meetup's three fee crises, Gas's paid "God Mode" hints and Life360's data
   sales are the three ways social products destroy trust. Monetise venues and
   power hosts (section 5.4).
8. **Own one look.** The most-shared visual, the plan link preview, uses the
   retired terracotta palette. Three app themes are homages to Partiful, Luma
   and Hinge. Keep the themes; make the default and every unfurl unmistakably
   Switchboard (section 7).
9. **Measure plans that happened, and the guest funnel.** The North Star exists
   but depends on a host tapping "Mark it happened", and RSVPs through the
   shared link and guest links are not tracked. The viral loop is invisible
   (section 11).
10. **Launch SLC friends-first, through hosts and rituals, around ski season.**
    Utah is the youngest state with the highest measured social capital, and
    every ski day is a capacity-limited plan that fills one seat at a time
    (section 5.3).

---

## 1. Switchboard today

Full audit: [`landscape/S-switchboard-audit.md`](landscape/S-switchboard-audit.md).

**Scale.** 91 shipped features in 6 groups (`src/lib/features.ts`), 49 page
routes, 155 migrations, about 95k lines of non-test TypeScript, 160 `SB-`
error codes, seven walkthroughs. Production PWA, no native app. Launch city
Salt Lake City. No revenue line.

**What no mainstream competitor ships:**

| Mechanic | Where | Nearest competitor analogue |
|---|---|---|
| Cascading invites: one at a time or in waves, per-person response windows, preview before sending, editable after | `src/lib/engine/cascade.ts`, `cascade-runner.ts` | Waitlists (Luma, Partiful). Nobody sequences the ask. |
| Private weighted polls (love / good / rather not), aggregate-only consensus meter, polls that close themselves, poll chains | `src/components/polls/PollSection.tsx` | When2meet, Doodle, Rallly: every one shows names next to votes |
| Two kinds of no: "Can't this time, keep asking!" and "Not really my thing" | `RsvpCard.tsx`, `src/lib/run-it-back.ts` | None |
| Give space: a private, vague heads-up about someone you would rather avoid | `features.ts` id `give-space` | None. Clubhouse's "Leave quietly" is the nearest spirit. |
| Mutual among existing friends, with no unrequited reveal | `src/app/mutual/` | Partiful Crush (co-attendees, romance-framed, Dec 2025) |
| Standing rituals, skip without guilt | `/mutual` | Heylo recurring events, Luma calendars |
| Rooms that file chat into Places, Tasks, Links, Notes | `src/lib/ai/extract.ts` | None |
| Guest-initiated SMS: guest texts `JOIN <token>`, consent covers one plan and expires, host never sees the number | `docs/SMS.md` | Partiful requires and keeps a phone number |

**Table stakes present:** event page, cover image, RSVP questions, capacity
and waitlist, co-hosts, announcements, reminders, calendar add and webcal
feeds, CSV export, invite links with OG cards, import from Partiful, Luma,
Facebook, Apple Invites and Eventbrite links, room photos, split the bill,
recurring plans, push, email and SMS delivery, block and report, export and
deletion.

**The gaps that matter against the field** (each verified in source):

1. Shared-link RSVP needs an account (`src/components/events/RsvpSignInGate.tsx`:
   "Sign in to RSVP").
2. The wizard requires at least one invitee (`stepComplete` in
   `src/app/events/new/EventWizard.tsx`: `invitees.length > 0`).
3. Invite mode defaults to `all_at_once`, described as "The right choice for
   most plans" (`src/app/events/new/steps/wizard-types.ts`).
4. Attending a plan creates no connection; the intimate features wait on
   manual friend adds.
5. The plan OG card uses `#b0563a` and `#ffd9c7`, the retired terracotta
   (`src/app/api/og/event/[id]/route.tsx`).
6. Guest-side RSVPs (`respondViaShareLink`, `respondToGuestInvite`) and all
   send, open and share events are untracked.
7. About 25 of the 91 features need local density or heavy trust and safety
   work, and the dating lane sits beside a planning tool.

**What to lean into:** the consent architecture, the cascade for small plans
where over-inviting is the real social cost (coffee, a spare ticket, four seats
in a car, a dinner for six), and private group decisions. All three work at a
density of two people. None of the serendipity features do.

---

## 2. The map

### 2.1 Positioning

Scores are 1 to 5 (1 is the left label). Judgement, informed by the memos.

| Product | Strangers (1) to friends (5) | One-off (1) to recurring (5) | Broadcast (1) to targeted (5) | Host-centric (1) to group-centric (5) | Aesthetic (1) to utilitarian (5) |
|---|---|---|---|---|---|
| Partiful | 5 | 2 | 2 | 1 | 1 |
| Luma | 2 | 3 | 1 | 1 | 2 |
| Apple Invites | 5 | 1 | 2 | 1 | 1 |
| Posh | 1 | 2 | 1 | 1 | 2 |
| Timeleft, 222, Pie | 1 | 4 | 4 (curated) | 4 | 3 |
| Bumble For Friends | 1 | 2 | 3 | 3 | 3 |
| Meetup | 1 | 5 | 1 | 2 | 5 |
| Howbout, Saturn | 5 | 4 | 3 | 4 | 4 |
| Group chat | 5 | 3 | 2 | 5 | 5 |
| **Switchboard** | **4** | **4** | **5** | **4** | **3** |

### 2.2 The field at a glance

| Product | Job | The hook | Money | Scale and status | Take | Refuse |
|---|---|---|---|---|---|---|
| **Partiful** | Invite pages for friend parties | The invite as artifact; guest list as social proof | Ticketing since Jun 2026 (about 10 to 15%), Instacart group order | ~500K MAU Q1 2025 (Sensor Tower); $20M Series A 2022, no later round found | Poster-quality unfurls, three-tap RSVP, playful voice | Mutuals spam, phone-as-identity, public guest lists, "pls commit soon" |
| **Luma** | Event pages and calendars for communities | Follow-a-host calendars with iCal feeds | 5% on paid tickets, or Luma Plus $59/mo annual | 6 to 7 staff, profitable, $3M seed only | Calendars as subscriptions, deliverability breaker, calm craft | Scrapable guest lists |
| **Apple Invites** | Native invites for iPhone hosts | Distribution and polish | iCloud+ to host | Launched Feb 2025; ships monthly (co-hosts Jun 2026) | Maps and weather on the invite, full-res shared album | Paywalling the recruiting side |
| **Posh** | Nightlife ticketing and discovery | Promoters bring audiences | 10% + $0.99 per ticket | $37M Series B Mar 2026 | Nothing for the core loop | The graph turning into promotion |
| **Timeleft** | Dinner with strangers, Wednesdays | No choice to make; everyone is new | Subscription, priced by city; restaurants pay | ~15,000 diners a Wednesday, 275 cities (company claim) | Ritual cadence, staged reveal, restaurant guarantee, earned media | Assigned companions, hidden venue, auto-connecting whole tables |
| **222** | Curated nights out with five strangers | No profiles, no DMs, no swiping | $22.22/mo, venues pay | 17 markets; $10.1M Series A Dec 2025 | "Who would you meet again" after every night | No-show fees and expulsion, romance ambiguity |
| **Pie** | Pods of six inside public events | A pre-assigned group and chat before you arrive | Not found | ~300K users (company claim); Community Homes Aug 2026 | Pod inside a crowd, paying hosts | Algorithmic assignment |
| **Bumble For Friends** | Friend matching plus groups | Swipe, then groups | Subscriptions | Rebuilt on Geneva ($17M, no revenue) Sep 2025 | "Invite at least two" minimum group | 1:1 stranger friendship as the core |
| **Meetup** | Interest groups | Indexable group pages; regulars | Organiser subscriptions, Meetup+ | Owned by Bending Spoons (also owns Eventbrite) | Recurring events, SEO, QR check-in | Taxing hosts, selling waitlist priority |
| **Run clubs / Strava** | Fixed-time group runs | Nothing to decide, side-by-side, after-ritual | Brands and venues sponsor hosts | Running-club participation +59% (Strava 2024) | Happens-unless-cancelled, pace groups | Nothing |
| **Howbout** | Shared social calendar | Seeing a friend is free removes the ask | Freemium | 4M+ MAU (company claim); $8M Series A | Ambient availability | Invite-only onboarding |
| **Saturn** | High school timetable as social calendar | Zero-input availability | Acquired by Snap Jun 2025 | ~80% of US high schoolers at a supported school | Inferring free time from structure | Contact-book copying (NY AG, $650K) |
| **When2meet / Doodle / Rallly** | Find a time | No account, one link, a heatmap | Ads, Pro tiers | Mature | No-account response | Names beside every vote |
| **Down to Lunch** | "I'm free" toggle | One button | None | No. 2 App Store 2016, then gone | Expiring status | Invite walls, broadcast to everyone |
| **Zenly / Bump** | Friends on a map | Battery, speed, dwell time; freeze and fuzz | None | 35 to 40M MAU, killed by Snap Feb 2023 | Micro-context, deniable privacy, delight | Running a loved product with no revenue |
| **Life360** | Family location | Parents paying for safety | Subscriptions, data | 95.8M MAU FY2025 | Nothing | Asymmetric tracking, selling location |
| **Locket** | Friends' photos on your home screen | 20-friend cap | Subscriptions | 9M+ DAU, profitable 2024 | Small audiences, ambient presence | Nothing |
| **BeReal** | Daily simultaneous photo | Reciprocity gate, shared moment | None to speak of | DAU fell 61% in five months; sold to Voodoo | Shared ritual moments | The late stamp |
| **Gas / tbh** | Anonymous compliments | Being chosen | Paid hints ("God Mode") | Both bought and shut | School-by-school density | Selling de-anonymisation |
| **IRL** | Social calendar turned chat | None that survived | None | Board found ~95% of 20M users were bots; shut 2023 | Nothing | Bought installs, vanity MAU |

### 2.3 What everyone converged on

Across segments, the products that held up share five traits:

1. **Small units.** Locket's 20 friends, tables of 4 to 6, pace groups, pods of
   six, Close Friends. Intimacy scales by shrinking the audience.
2. **A reason to come back that lives outside the app.** The dinner, the run,
   the plan. Products whose only object is a feed (BeReal, Poparazzi, Noplace,
   Clubhouse) faded within about a year.
3. **The guest side needs no install.** Partiful, Luma, Apple Invites,
   When2meet.
4. **Hosts are the scarce side.** Meetup, Pie, Luma and run clubs all live or
   die on whether hosting stays cheap and rewarding.
5. **Trust failures kill faster than product failures.** Down to Lunch's hoax,
   IRL's bots, Yik Yak's bullying, Saturn's settlement, Instagram Map's
   backlash.

---

## 3. Teardowns

Each entry: the loop, why it works, look and voice, growth, money, where it
breaks, and the verdict for Switchboard. Sources and tags are in the memo named
at the top of each segment.

### 3.1 Invites and hosting

Memo: [`landscape/B-invites.md`](landscape/B-invites.md).

#### Partiful

- **Loop.** One scrolling editor that is also the preview: title, date (can be
  TBD), place, a poster (upload, GIF, template or AI "Party Genie"), a theme and
  a full-screen effect. The host pastes the link into group chats or invites
  past guests ("Mutuals"). Guests RSVP on the web with no app but must verify a
  phone number. Day-of text blasts filtered by RSVP status, automatic reminders,
  a shared photo album afterwards. Attending once makes you a Mutual of
  everyone there.
- **Why it works.** The invite is a self-expression artifact worth
  screenshotting; hosting becomes a creative act. The guest list sells the
  party. The guest experiences the whole product before deciding to host.
- **Look and voice.** Maximalist and low-fi: full-bleed posters, bold display
  type, particle effects, emoji as UI. Lowercase texting register: the Maybe
  nudge reads "pls commit soon". App Store: "The easiest way to plan and
  discover social events."
- **Growth.** Every RSVP hands over a verified phone number, making the guest a
  reachable node. The Mutuals graph lets hosts invite everyone they have ever
  partied with. Campus growth managers run activation weeks. It filled the gap
  Facebook Events left for people who never used Facebook.
- **Money.** Free invites. Instacart group order. Ticketing on Stripe Connect
  since 2026-06-02, fees not standardised (about 10 to 15%).
- **Where it breaks.** Vice documented the Mutuals graph turning into spam:
  more invites from strangers than friends, some of them ticketed, with only
  per-person blocking as a defence. Phone-as-identity drew a June 2025
  surveillance backlash. Maybe is treated as a soft failure. Full guest lists
  let anyone check whether a specific person is coming.
- **Crush (Dec 2025).** Private picks of up to 10 Mutuals; a match is revealed
  only when mutual. This proves demand for mutual reveal and puts Partiful on
  Switchboard's ground, framed around romance and limited to co-attendees.
- **Verdict.** Take the artifact quality, the three-tap guest path and the
  confidence of the voice. Refuse co-attendance as invite permission, phone as
  identity, and public guest lists by default.

#### Luma

- **Loop.** A clean page in about 60 seconds. Registration is name and email,
  login by email code. Optional approval (bulk actions, canned messages),
  capacity, waitlist (free events only), questions, ticketing. QR tickets and
  a check-in scanner. Every host owns a Calendar that people follow, each one
  an iCal feed.
- **Why it works.** Follow-the-host replaces the feed. Each event teaches
  attendees the format, and some of them host the next one.
- **Look and voice.** Calm, exact, half the team are designers. 40+ themes
  (Minimal, Confetti, Warp, Special Effects), each with curated fonts. Single
  black Register button. "Delightful events start here." Help copy is plain and
  specific.
- **Channels.** Email, SMS in the US and Canada, WhatsApp elsewhere. Guests own
  their channels and opt out with STOP; hosts cannot override. Luma blocks a
  calendar's sending when bounce or spam rates spike.
- **Money.** 5% on paid tickets, or Luma Plus at $59/mo billed annually (about
  $69 monthly) for 0% platform fee. Free events subsidise the network.
- **Where it breaks.** Guest lists are scraped and sold (Apify scrapers).
  "Pending approval" can sit for days with no signal.
- **Verdict.** Take calendars as subscriptions, the guest-owns-the-channel
  rule, and the per-sender deliverability breaker. Refuse visible guest lists
  for anything but professional events.

#### Apple Invites

- **Loop.** Background from your photos or Image Playground, title, date,
  place, note, share by link. Maps directions and weather added automatically.
  Shared album and Apple Music playlist per event. Hosts need iCloud+; guests
  RSVP on the web with no Apple Account (Android guests verify by email link
  since October 2026).
- **2026 cadence.** iMessage app and All Events view (April), co-hosting and an
  opt-in "show invited guests to all attendees" (June), emoji reactions and a
  confetti RSVP (July), full-resolution albums (October). The "thin" critique
  is ageing.
- **Where it breaks.** The paywall sits on the side that recruits. Partiful
  said in April 2025 it had seen no users leave for Apple. No adoption numbers
  exist.
- **Verdict.** Polish and distribution did not dislodge a product with a
  culture. Compete where Apple will not go: cascades, private polls, mutual
  matching, Android and SMS guests.

#### Posh, Evite, Paperless Post

- **Posh** ($37M Series B, March 2026; 10% + $0.99 per ticket) is public, paid
  nightlife. Its lesson for Switchboard is a warning: once an app adds paid
  public events, its invite graph starts carrying promotion.
- **Evite** claims 20M+ MAU and sells per-event Premium ($17.99 to $99.99) to
  remove ads. Ads on an invite cheapen the artifact.
- **Paperless Post / Flyer** shows that a ceremony moment (the envelope
  opening) raises perceived value, and that design quality is what people pay
  for at weddings.

### 3.2 Strangers to the table

Memo: [`landscape/A-strangers.md`](landscape/A-strangers.md).

#### Timeleft

- **Loop.** A two-minute personality quiz instead of a profile. Book a
  Wednesday at 7 p.m. Staged reveal: tablemates' industries, signs and a
  demographic breakdown the day before, the restaurant on the morning, the table
  number an hour before, a Live Activity countdown. Tables of 4 to 6. Around 8
  p.m. the app reveals a nearby "Last Drinks" bar shared with every Timeleft
  table in the area. Afterwards, **Timeleft Connect**: "There's no need to
  'match' anymore; all participants are automatically connected." **Repeat**
  lets you invite past tablemates to your next table. **Bring a +1** exists
  because going alone is the top objection.
- **Matching.** A seating problem: a balanced mix of men and women (women are
  over 60% of diners), "an age gap of five to seven years for common life
  echoes", "a mix of introverts and extroverts", language, budget, area.
- **Why it works.** No decision to make, and everyone is new, so nobody is the
  outsider. Prepayment as commitment. Six people in public is safe. The Last
  Drink lets a good night continue without anyone having to ask.
- **Growth.** Founders attended the first 60 dinners incognito. They say paid
  ads did not cover costs; what worked was about 400 press pieces, an Instagram
  audience near 1M, templated city-launch posts with local puns, and sponsored
  local newsletters ("Go to dinner with strangers in [City] with Timeleft").
  Restaurants are guaranteed two tables of six a month, so the venue gets a
  full table on a slow weeknight. Ran on Bubble and FlutterFlow for 16 months.
- **Money.** Time-based subscription, priced by city; food always separate.
  About $7M raised per CB Insights; €18M ARR in August 2025 per a single source
  *(unverified)*.
- **Where it breaks.** "If I knew it was only 3 of us, I would have canceled."
  No-shows, overbooking, billing and refund complaints, form-only support,
  chemistry that never clicks ("14 dinners and none were amazing"). Late venue
  reveal is a transit and accessibility problem. Expanded to 320 cities, then
  pruned to about 200.
- **SLC.** No evidence Timeleft operates there.
- **Verdict.** Take the weekly ritual, staged anticipation for the fun parts,
  the venue guarantee, founder presence and local earned media. Refuse
  assigned companions, hidden logistics, silent demographic quotas, and
  auto-connecting everyone, which is the opposite of mutual consent.

#### 222

- **Loop.** A questionnaire of about 30 items. Invitations to dinners, comedy
  and nights out in groups of six, "usually three men and three women". A text
  before the night with a few facts about the others. "No Swiping, No Profiles,
  No DMs." After each night, members say who they would like to see again,
  which trains the matcher and books a second meetup.
- **Psychology.** Angel-number branding ($22.22) reads as fate. The meet-cute
  is possible but unstated; members split roughly half friends, half romance.
  Curation as status. No-show fees and removal as a commitment device.
- **Money.** $22.22 a month; venues pay too. $10.1M Series A, December 2025.
- **Where it breaks.** Curation turns into feeling rejected by the product.
  The App Store listing now says 222 is not a dating, friend-making or
  networking app, which sits awkwardly with "find your people". Matching is
  admitted to be weak until you have attended several times.
- **Verdict.** Take the post-night "who would you see again" signal, and make
  it strictly mutual and never revealed if one-sided. Refuse punitive no-show
  policies and intent ambiguity.

#### Pie

- Andy Dunn's app. You attend a public event (a run club, a mahjong night)
  already assigned to a **pod of six** with a group chat before you arrive.
  Hosts are paid. About 300K users *(company claim)*. In August 2026 it
  launched Community Homes, permanent group pages, with Dunn calling it a
  "Reddit for IRL".
- Dunn's diagnosis is the best external validation of Switchboard's thesis:
  "A friendship match becomes a standoff, where neither person wants to make
  the first move."
- **Verdict.** Take the pod inside a crowd for Open Table on public events.
  Refuse assignment without a veto.

#### Bumble For Friends, Meet5, Thursday, the 2025 to 2026 rounds

- **Bumble For Friends** was rebuilt in September 2025 on Geneva (bought for
  about $17M; no revenue as of June 2025). Groups, chat rooms, a calendar, and
  a rule that a group meet-up needs at least two invitees, so nobody is alone
  with one stranger. The pivot exists because 1:1 friend matching stalled in
  chat.
- **Meet5** (Germany, 40+, €8M Series A) runs free member-hosted meetups and
  charges for premium features. Proof that the over-40s are an underserved,
  lonelier, better-funded audience.
- **Thursday** shut its dating app in 2025 and became an events company.
- **Sweatpals** ($12M seed, October 2025; 1M+ monthly users, 60% women aged 20
  to 35) and **Clyx** ($14M, September 2025) show investors fund IRL social
  when someone other than the lonely person pays (gyms, venues).
- **Category size.** Appfigures estimates about $16M of US consumer spending
  across more than a dozen local friendship apps in 2025. Paying users for
  friendship is a small market. Venues and hosts are the payers.

### 3.3 Groups and communities

Memo: [`landscape/C-communities.md`](landscape/C-communities.md).

#### Meetup

- **Arc.** Founded 2002 on "using the internet to get off the internet". Has
  charged organisers since 2005. A 2019 test charging members $2 per RSVP
  produced a revolt (one free coding group calculated a 1,210% cost increase)
  and was withdrawn. Bought by Bending Spoons in January 2024; organiser prices
  rose from June 2024 (Standard from $29.99/mo, PRO from $55 per group per
  month), and organisers of small hobby groups reported 3 to 4 times the cost.
  **Meetup+** sells members "priority on waitlists" and fuller visibility of
  who is attending. Bending Spoons completed its purchase of Eventbrite on
  2026-03-10, so one owner now holds both legacy platforms.
- **What still works.** Every group is an indexable topic-and-city page; SEO
  brings strangers in. Recurring events. The 2025 redesign shows an age and
  gender breakdown of who is going, aimed at newcomer anxiety, especially for
  women. 2026 adds QR check-in.
- **What breaks.** An academic study found that losing the leader is usually
  what kills a group. Dead groups keep impressive member counts while the
  calendar stops (one public group: 8,317 members, largest event 283 RSVPs).
  Free community events routinely see 35 to 50% no-shows.
- **Verdict.** Take recurring events, topic-and-city pages for opted-in public
  rituals, and showing composition before commitment. Refuse taxing hosts,
  selling priority, and counting members.

#### Facebook Groups and Events, Discord, WhatsApp, Instagram

- Teen Facebook use fell from 71% (2014-15) to 32% (2024, Pew). Facebook
  Groups still runs neighbourhood, parent and hobby communities for people over
  30, which in SLC likely includes climbing, ski-touring and church-adjacent
  groups.
- Discord is the chat layer of many IRL scenes but overwhelms newcomers.
  WhatsApp is where groups end up because everyone has it. Instagram is the
  storefront for run clubs and supper clubs.
- **Verdict.** Be the coordination and memory layer: who came, what's next,
  who's a regular. Export beautifully to the chats and to Instagram. Do not
  build another chat app; Geneva had no revenue and was absorbed.

#### Heylo, Nextdoor

- **Heylo** is free until the organiser collects money, then takes a cut. That
  aligns the platform with organiser success.
- **Nextdoor** (about 22M weekly actives) shows what an open geographic feed
  becomes: crime posts, complaints and arguments, contained only by friction
  like its "Kindness Reminder". Neighbourhood boards need structured post types
  and a "do something together" purpose.

#### Run clubs

- Strava's 2024 report counted a 59% rise in running-club participation; new
  clubs nearly quadrupled in 2025. Run clubs work because they meet every one
  of the conditions research associates with friendship (section 4):
  - **A fixed time and place, forever.** No poll, no RSVP; come once a month
    and still belong.
  - **The activity is the excuse.** Side by side lowers eye-contact pressure.
  - **Pace groups** split 100 people into groups of 4 to 10.
  - **An after-ritual** (coffee, a beer) where the socialising happens.
  - **Free**, so a no-show costs nobody anything.
  - **Hosts are paid in status, product and venue relationships.**
- **Verdict.** This is the template for standing rituals and for the SLC
  launch communities (run, climb, ski).

### 3.4 Calendars, availability and presence

Memo: [`landscape/D-calendars-presence.md`](landscape/D-calendars-presence.md).

#### Howbout

- Import your calendar's busy blocks, share it with friends, see overlays,
  propose a plan, vote, chat. More than 75% of users share their full calendar
  with at least one friend. $8M Series A, 4M+ MAU *(company claim)*, US its
  largest market. The closest availability-first rival.
- **Where it breaks.** An overlay is only as good as the share of friends with
  real calendars, and most under-25s do not calendar their social life. An
  empty calendar falsely reads as free.

#### Saturn

- Builds a high schooler's timetable automatically and shows which friends
  share a free period. "More than 30% of our users interact with a friend on
  Saturn daily, usually to see when they are free." Zero-input availability.
- The line to frame: "We believe the stigma around calendaring with friends on
  incumbent platforms like iCal and Google Calendar is rooted in email, rather
  than the calendar itself."
- Bought by Snap 2025-06-20. In March 2025 New York's Attorney General settled
  with Saturn for $650K after it stopped verifying school email, copied
  contact books and kept them after access was revoked, and exposed data about
  students who never joined.

#### Group-decision tools

- When2meet, Doodle, Rallly and LettuceMeet share one strength (no account,
  one link, a heatmap) and one blind spot: **every one shows names beside
  votes**. Who could not make it, and who never answered, is visible to all.
  None separates "can't" from "don't want to". Switchboard's aggregate-only
  polls are the opening.

#### "I'm free" toggles

- **Down to Lunch** (2015) was one button: pick a status, friends get
  notified. It reached No. 2 in the US App Store and spread through BYU. It
  grew with an invite wall that produced spam complaints, then collapsed after
  a baseless trafficking hoax in February 2016. Google's **Who's Down** tried
  an expiring three-hour slider and never launched widely. Dozens of toggle
  apps since then show no scale.
- **Why toggles die.** Too few friends free at the same time; broadcasting to
  everyone causes notification fatigue and the sting of public non-response;
  nothing durable is left behind; stale signals erode trust; and a single
  trust shock is fatal.
- **Verdict.** The toggle is a feature. It needs to reach chosen people,
  notify only on a match, show its age and expiry, and collapse into a plan.

#### Zenly, Bump, Snap Map, Find My, Life360, Instagram Map

- **Zenly** (35 to 40M MAU) was shut by Snap in February 2023 for lack of a
  path to profit, while users petitioned to save it. People loved the playful
  map and its **micro-context**: a friend's battery, speed, and time at a
  place, which read like gossip rather than surveillance. It offered
  **freeze** and **fuzz** per friend: privacy that is socially deniable. The
  founders' **Bump** carries this forward, including shaking phones to record
  that you hung out.
- **Snap Map** (350M+ monthly users) keeps sharing off by default, friends
  only, and periodically re-prompts people who share widely.
- **Apple Find My** offers one-time, one-hour, end-of-day and indefinite
  sharing, plus **Check In**, which shares location only if you are late and
  do not respond. iOS 27 added a silent per-person Hide Location for up to 12
  hours, though the viewer sees "No Location Found".
- **Life360** (95.8M MAU) is parents paying for safety. It sold precise
  location to data brokers (The Markup, 2021) and faces stalking allegations
  over Tile. Asymmetric tracking turns play into control.
- **Instagram Map** (August 2025) drew immediate backlash because people could
  not tell at a glance whether they were visible; 37 state attorneys general
  asked Meta to disable it for minors.
- **Wizz**, a swipe-to-befriend app for teens, was pulled from both stores in
  January 2024 over sextortion.
- **Verdict.** Location reads as play when it is symmetric, consensual,
  contextual and deniable, and as control when it is asymmetric, ambiguous or
  sold. A PWA cannot get background location, which suits time-boxed "find
  each other" sharing around a plan, the safer design anyway.

#### Beli

- Restaurant rankings by pairwise comparison, visible only to followers, with a
  friends' average. Over 80% of users join through referral. A friends-only
  taste graph makes the next plan easy ("you both rank X highly").

### 3.5 Intimacy apps

Memo: [`landscape/E-psychology-closefriends.md`](landscape/E-psychology-closefriends.md), part 1.

| App | Hook | Why it held or decayed | Lesson for Switchboard |
|---|---|---|---|
| **BeReal** | One unpredictable shared moment; see friends only after you post | DAU fell 61% in five months; the late stamp turned authenticity into compliance | Shared ritual moments work. Never show lateness or absence to others. |
| **Locket** | Friends' photos on your home screen, 20-friend cap | 9M+ DAU, profitable 2024 | A capped audience is a feature. Ambient presence beats a feed. |
| **Retro** | Weekly photo journal for followers | A humane cadence; recaps and postcards | Weekly is the right rhythm for radar and recaps. |
| **tbh / Gas** | Anonymous positive polls about classmates | Poll fatigue; Gas sold hints about who sent it | Never monetise de-anonymisation. Turn signals into plans, not more signals. |
| **Lapse** | Photos that develop later; "friends not followers" | A five-text invite gate took it to No. 1, then downloads fell about 70% | Forced invites spend the user's social capital. Invites come from real plans. |
| **Clubhouse** | Drop-in live audio | Lockdown novelty; laid off half its staff in 2023 | "Leave quietly" is a model anti-awkwardness primitive. Bounded time with known people beats open-ended live time. |
| **Poparazzi** | Only friends can post photos of you | Shut 2023 | A clever constraint is a launch, not a habit. |
| **Dispo** | Photos develop at 9 a.m. next day | Influencer-tied | Delayed reveal is a strong memory mechanic. |
| **Marco Polo** | Async video walkie-talkie | Families and long-distance friends | Async warmth maintains outer-layer ties cheaply. |
| **Instagram Close Friends** | Stories for a chosen few | Smaller audiences increase sharing (Mosseri) | Default to the smallest audience that makes the plan happen. |
| **Geneva** | Group chat for clubs | No revenue; absorbed into Bumble | Win what groups do (meet), not where they talk. |

### 3.6 The graveyard

Memo: [`landscape/F-strategy.md`](landscape/F-strategy.md), section 2.

| Product | What happened | Lesson |
|---|---|---|
| **IRL** | $170M Series C at $1.17B; a board investigation found about 95% of its 20M users were bots; shut June 2023; the SEC charged the CEO in 2024 (founders dispute the figure) | Count plans that happened. Never buy installs. |
| **Clubhouse** | $4B in 2021; installs fell from 9.6M to under 1M a month within two months | Novelty from an external shock is not retention. |
| **Houseparty** | Peaked 2020, shut 2021 | Synchronous "who's free now" decays without a reason to open. |
| **Path** | An intimate network; FTC settlement in 2013; shut 2018 | Intimate positioning cannot be grown with growth hacks. |
| **Yik Yak** | Anonymous local posts; bullying; shut 2017, revived, sold | Anonymity without accountability turns toxic. Keep it to signals. |
| **Foursquare** | Check-ins peaked about 2012 to 2014; City Guide app shut December 2024; the company survived on B2B location data | Broadcasting location decays as a habit. Never take the data path. |
| **Hey! VINA, Patook, Friended** | 1:1 swipe-for-friends apps that faded | Friend matching reproduces dating fatigue without dating's motivation. |
| **Meetup's 2019 fee** | Per-RSVP charge withdrawn after a revolt | Never tax the act of saying yes. |

---

## 4. The evidence base

Memo: [`landscape/E-psychology-closefriends.md`](landscape/E-psychology-closefriends.md), part 2.
Each row below is verified unless marked. Use the wording given; several
popular summaries of these studies overstate them.

### 4.1 Findings and what they mean here

| Finding | Source | What it means for Switchboard |
|---|---|---|
| People underestimate how much others appreciate being reached out to, most of all when the contact is unexpected | Liu, Rim, Min and Min, *JPSP*, 2022 (5,900+ participants) | Reconnection radar's first touch should be tiny, and its copy can say so. Unexpected contact from weaker ties is valued most. |
| After a conversation, people underestimate how much the other person liked them (the liking gap) | Boothby, Cooney, Sandstrom and Clark, *Psychological Science*, 2018 | The post-plan "again?" prompt, revealed only when mutual, closes this gap without exposing anyone. |
| Requesters underestimate by as much as 50% how likely others are to say yes, because they forget refusing is socially costly | Flynn and Lake, *JPSP*, 2008 | Two consequences: asking works better than people think, and some yeses are awkward yeses that later flake. Private answers make the yeses real. |
| Invitees overestimate how badly a decline will land; 77% had accepted an invitation they did not want, fearing the consequences | Givi and Kirk, *JPSP*, online December 2023 | "Can't this time, keep asking!" is evidence-based. Decline should be cheap and warm, and never shown to the group. |
| Some people anxiously expect rejection and read it into ambiguous cues | Downey and Feldman, *JPSP*, 1996 | Silence is the cue most likely to be misread. No "seen", no hanging states; non-answers resolve to neutral on a deadline. |
| People overestimate how much others notice them (spotlight effect): about half the room predicted, under a quarter actual | Gilovich, Medvec and Savitsky, *JPSP*, 2000 | A host's failed plan feels public. Tell only the host, kindly. Never notify invitees that a plan collapsed. |
| Commuters told to talk to a stranger had better rides than predicted; nobody was snubbed | Epley and Schroeder, *JEP: General*, 2014 | Pre-plan dread is mostly anticipation. Say so at the moment of hesitation, once. |
| Voice builds stronger bonds than text with no measurable extra awkwardness | Kumar and Epley, *JEP: General*, 2021 | Optional voice notes on invites and a "five-minute call to pick a time" can beat a long thread. Voice notes already ship. |
| People judge their own vulnerability as weakness and others' identical vulnerability as courage (beautiful mess) | Bruk, Scholl and Bless, *JPSP*, 2018 | "I miss hanging out, coffee?" feels riskier to send than it is to receive. Offer the template. |
| Group members misjudge peers' private attitudes (pluralistic ignorance) | Prentice and Miller, 1993; Jordan et al., *PSPB*, 2011 | Mutual-interest matching is the cure: it reveals a shared wish only when shared. No study tests "everyone wants to hang out but nobody asks" directly; present that as an inference. |
| About 50 hours together to become a casual friend, about 90 for a friend, 200+ for a close friend; leisure time counts, work time much less | Hall, *J. Social and Personal Relationships*, 2018 | Only recurrence gets there. A monthly two-hour ritual is 24 hours a year. Hours together can be a private compass, never a public score. |
| Friendship needs proximity, repeated unplanned interaction, and a setting where people let their guard down | Rebecca Adams, via NYT 2012 | The core design brief. An app cannot create unplanned interaction, but it can make repetition nearly free. |
| Repeated exposure increases liking, even without interaction | Zajonc 1968; Moreland and Beach 1992 | Low-participation attendance should be welcome. Showing up without talking much still builds ties. |
| Networks nest in layers of about 5, 15, 50, 150. Friendships lose closeness when contact and shared activity fall; kin ties do not | Dunbar; Roberts and Dunbar, *Evolution and Human Behavior*, 2011 (25 students, one transition) | Radar should be layer-aware: rituals for the inner 5, periodic re-warming for the 15 and 50. Do not encourage managing 150. |
| Weak-tie interactions go with more happiness and belonging on the same day | Sandstrom and Dunn, 2014 | One hop out (friends of friends via Open Table) creates weak ties at low risk. Unbounded stranger discovery does not. |
| Fewer, concrete options with a default convert better; "choice overload" itself does not replicate reliably | Iyengar and Lepper 2000; Scheibehenne et al. 2010 (mean effect about zero) | Offer two or three times and a proposed place. Do not build on "decision fatigue" as settled science. |
| Rituals restore a sense of control and regulate emotion | Norton and Gino 2014; Hobson et al. 2018 | Once agreed, a ritual removes the asking problem entirely. |
| Phones on the table lower enjoyment of a meal with friends | Dwyer, Kushlev and Dunn, 2018 (modest effect) | Go quiet during a plan window. Bring the memory back the morning after. |
| Stronger social relationships: 50% higher odds of survival (odds ratio 1.50) | Holt-Lunstad, Smith and Layton, *PLoS Medicine*, 2010 | Say "50% higher odds", never "50% more likely to survive". The "15 cigarettes" line is the Surgeon General's comparison, not the paper's. |
| About 1 in 6 people worldwide are lonely, linked to about 871,000 deaths a year; 17 to 21% of 13 to 29 year olds | WHO Commission on Social Connection, June 2025 | Young people are the loneliest cohort. Name the outcome (seeing people), never the deficit. |
| 25% of US men aged 15 to 34 felt lonely "a lot of the previous day" | Gallup, 2025 | Activity-first templates ("I'm going to X, want in?") may serve young men better than "let's catch up". |
| Americans' in-person time with friends fell from about 60 minutes a day (2003) to about 20 (2020); about a 70% drop for 15 to 24 year olds | Surgeon General advisory, 2023 | Measures differ by study; the sharpest drop is among teenagers. Cite carefully. |
| Engagement-tuned ranking for "meaningful social interactions" amplified outrage | WSJ Facebook Files, September 2021 | Any in-app engagement metric gets gamed. Measure outcomes outside the app. |
| Dark patterns: false scarcity, hidden costs, obstructed cancellation, subverted privacy choices; contact-import reminder emails cost LinkedIn $13M | FTC staff report 2022; Perkins v. LinkedIn | Never upload address books silently, never send what the user did not compose and approve, no fake urgency, no streaks. |

### 4.2 Twelve principles that follow

1. **The smallest audience that makes the plan happen.** Default to the
   cascade and small groups.
2. **Reveal desire only when it is mutual.** Mutual, post-plan "again?",
   aggregate signals with a minimum group size.
3. **Make asking feel as cheap as it really is.** Tiny first touches,
   vulnerable templates, research-backed reassurance used sparingly.
4. **Make no cheap and private, so yes means yes.**
5. **Silence never hangs.** Every pending state has a deadline and a neutral
   resolution. No read receipts, no visible absences.
6. **Failure is private, success is shared.**
7. **Repetition beats novelty.** Rituals at consistent places; low-energy
   attendance welcome.
8. **Count hours, not posts, and keep the count private.**
9. **One owner, one next step, two or three options.**
10. **Warm ties before they decay, layer by layer.**
11. **Grow by real plans, never by toll gates.**
12. **Step out during the plan, come back for the memory.**

Two cross-cutting rules: **anonymity protects the vulnerable party and is never
for sale**, and **no anonymous free text about a named person**.

---

## 5. Strategy

### 5.1 Positioning

**Statement.** For friend groups who want to see each other more but hate
being the one who asks, Switchboard is the plan-making app that makes asking
safe. You invite people one at a time or in waves, decide together in private,
and meet new people only when interest runs both ways. Event pages broadcast to
everyone and stranger-dinner apps start from zero. Switchboard starts with the
people you already know and keeps every no private, so more plans actually
happen.

**Tagline.** Keep **"Plans without the pressure."** It is already in the OG
footer and page title, it names the outcome, and no competitor owns calm.
Supporting lines:

- "Ask freely. Nobody sees a no."
- "Ask one friend at a time. Nobody finds out they were second."
- "Decide together. Nobody sees your vote."

**Category.** Do not call it a social network, a friend-finding app or an
event platform. Each of those puts Switchboard in a fight it loses on reach.
"Plan-making" is the category; consent is the reason to choose it.

**The two-halves problem.** `docs/PROPOSAL.md` gives planning and meeting new
people equal weight. Users and investors both struggle with a product that is
Partiful, Timeleft and Bumble For Friends at once. Keep the loop the proposal
describes, in a strict order:

1. Plan with people you know (the front door).
2. Make room for friends of friends on those plans (Open Table).
3. Let mutual consent turn a new face into a connection.
4. That connection becomes a guest on the next plan.

Meeting new people is what your friends' plans make room for. It is never a
separate stranger app.

### 5.2 The wedge and the surface hierarchy

DOCKET already asks "which is the wedge?" and recommends the intimate core.
The field agrees. Recommended hierarchy:

| Tier | Surfaces | Rule |
|---|---|---|
| **Front door** (always visible) | Make a plan, cascade, private polls, invite links, rooms, Calendar | Must work for a host whose friends have never heard of Switchboard |
| **Earned** (after a first plan or connection) | Mutual, I'm free, rituals, radar, Run it back, matchmaker | Unlocks as the person's graph grows from real plans |
| **Density-gated** (only where thresholds are met) | Zones, moments, people near you, the live map, people discovery, Open Table broadcast to strangers, boards | Off until a neighbourhood, campus, or ritual crosses a threshold. An empty map is worse than no map. |
| **Decide or retire** | The dating lane, parental approval and kids' presets on an 18+ product, Your Read prominence | Each needs an explicit owner decision recorded in `DOCKET.md` |

The gating already started: the Around pillar appears only with local density
(remediation 18). Extend the same rule to every surface in the third tier.

**The dating lane.** 222 straddles friends and romance and had to disclaim
dating in its store listing. Partiful framed Crush as romance and inherited
dating-app scrutiny. A dating lane inside a plan-making app invites the "is
this a dating app?" question from investors, App Store review and users at the
same time. Recommendation: keep mutual reveal platonic and plan-shaped ("I'd go
to X if you would"), and move any romance framing out of the core product until
the planning wedge has traction.

### 5.3 Salt Lake City go-to-market

Data from [`landscape/F-strategy.md`](landscape/F-strategy.md) section 3,
rechecked 2026-10-17.

**Why SLC suits the planning tool.**

- Utah's median age is 32.4, the lowest of any state.
- Utah has the largest average household size of any state.
- Utah ranked first on the JEC Social Capital Index and first for formal
  volunteering (46.6%). The hosts already exist.
- Fall 2025 enrolment: University of Utah 38,261, UVU 48,670, BYU 37,205, SLCC
  31,473.
- Metro population about 1.30M: small enough to saturate with a few hundred
  friend groups, large enough to prove a playbook.
- Ski days, carpools and climbing sessions are capacity-limited plans that fill
  one seat at a time. That is the cascade's natural habitat.
- The 2034 Winter Olympics give a long civic runway.
- Down to Lunch spread through BYU in 2016; campus virality has precedent here.

**Why SLC is harder for stranger discovery.**

- **Two social graphs.** The Latter-day Saint share of Utah is 42% by
  self-identification (2023 study), about half per Pew, and about 64% on church
  rolls; state which measure you cite. LDS social life is pre-structured
  (wards, YSA wards, Sunday observance, no alcohol). The transplant, non-LDS
  and post-LDS graph in the city is less structured and the better first
  market. Treat the two as separate pools with different defaults (dry venues,
  Sunday-light calendars, family plans) and never mix their launch messaging.
- Earlier marriage shrinks the single 25 to 35 pool compared with Denver or
  Austin. Households matter more here.
- Liquor law makes bars less central. Venue partners skew to coffee, dirty-soda
  shops, climbing gyms, breweries with food, and outfitters.
- No evidence that Timeleft or 222 operates in SLC. That is open ground and
  also a sign of thin stranger-dinner demand.

**Phases.**

| Phase | When | Goal | Moves |
|---|---|---|---|
| 0. Instrument and seed | Now to December 2026 | The guest funnel and plans that happened are measurable; 40 connector hosts recruited by hand | Ship the funnel fixes in section 6.1. Recruit hosts who already run ski carpools, run-club after-hangs, game nights and climbing sessions. Founders on a direct line to each. |
| 1. Ski season | December 2026 to March 2027 | 150 friend groups making 2+ plans a month; 40% of guests answer without installing | "Fill the car one seat at a time." Rituals ("powder Fridays", "Sunday-light brunch"). Five or six launch venues, including a dry option. |
| 2. Campus and new-in-town | January to May 2027 | First verified-school pocket dense enough to unlock Open Table and Mutual inside it | 20 paid student ambassadors drawn from clubs. Silicon Slopes onboarding partnerships ("your first ten plans in SLC"). Native host app and Android TWA timed to a campus launch week. |
| 3. Summer and the Wasatch Front | June to September 2027 | D30 host retention of at least 35%; 2.5+ plans per active host per month (proposed targets) | Zones at concert series and the farmers market only. Provo and Orem only after SLC hits targets. Then Boise, Denver or Austin. |

### 5.4 Money

| Model | Precedent | Fit | Recommendation |
|---|---|---|---|
| Venue partnerships | Timeleft guarantees restaurants two tables a month; Sweatpals sells to gyms; 222 charges venues | Venues get verified, group-sized arrivals on slow dayparts. `venue-perks` and `verified-places` already ship. | **Primary.** Monthly fee for verified group visits and a foot-traffic report. Never personal data, never paid placement in a person's plan suggestions without a label. |
| Power-host subscription | Luma Plus ($59/mo annual); Heylo; Meetup PRO | Run-club, climbing and community organisers with recurring rituals | **Secondary.** Rituals at scale, co-host teams, analytics, custom domains or themes. Never gate the cascade, polls, or any guest-facing feature. |
| Stranger seat fee | Timeleft, 222 | Only where curation and flake risk exist | **Tertiary.** Optional fee on stranger Open Table seats, refundable on attendance. Never on friend plans. |
| Ticketing | Partiful, Luma, Posh | Paid community events | Later, through Stripe Connect. Keep paid events out of every invite and mutual surface. |
| Cosmetics | Earned Transit theme, custom wallpaper | Small and harmless | Fine as an add-on. |
| Ads, data, paid visibility | Evite ads, Life360 data, Meetup+ priority, Gas God Mode | Corrodes the consent promise | **Never. Publish this as a pledge.** |

The pledge, ready to publish: guests are free forever; the cascade, polls and
mutual reveal are free forever; Switchboard never sells data, never shows ads
on a plan, never sells priority, and never sells a hint about who is
interested.

### 5.5 Risks

| Risk | Mitigation |
|---|---|
| Partiful or Apple copies the cascade | A single mechanic is copyable; consent across the whole system (private polls, no unrequited reveal, decline categories, give space) and a local venue network are not. Own the vocabulary. Ship the funnel fixes first so the mechanic is actually met. |
| Discovery features stay cold in a small, split market | Density gating (5.2). Two dense pockets (the U, downtown and Sugar House) before any city-wide map. |
| Install friction and iOS PWA limits | Guests never install. Coached Add to Home Screen after a first successful plan. Native host app later, with widgets and an App Clip for RSVP. |
| A safety incident on a stranger surface | Stranger features off by default and inside verified boundaries. First meetings at partner venues. A published trust and safety one-pager. |
| The cascade feels slow and hosts fall back to the group chat | Smart defaults (section 6.1), visible progress, and the Cascade Coach idea in `INNOVATIONS.md`. Measure time-to-full against the group chat. |
| Money arrives too late, like Zenly | Sign paying venues in phase 1, even at token prices. |
| An IRL-style credibility gap | Report plans that happened and retained friend groups, never registered users. No incentivised installs. |
| Two products confuse users and investors | The strict order in 5.1. |

### 5.6 Watchlist

Revisit these quarterly; each is moving toward Switchboard's ground.

- **Partiful Crush** expanding beyond romance or beyond co-attendees.
- **Apple Invites** monthly releases; any approval, poll or sequencing feature.
- **Howbout** adding sequencing or anonymous aggregates.
- **Pie Community Homes** and **Timeleft Repeat**: stranger apps building the
  second meeting.
- **Bending Spoons** pricing at Meetup and Eventbrite: each increase pushes
  small organisers out, and they need somewhere to go.
- **Snap** folding Saturn's calendar into Snapchat.

---

## 6. Product

Every recommendation names the precedent, the evidence and where it lands in
this repo. Changes that touch auth, the database, the service-role client,
redirects or share links must follow `docs/SECURITY.md`, `docs/AUTH.md` and
`src/lib/share-link.ts`; these are product recommendations, not designs that
bypass them.

### 6.1 Now: fix the funnel

1. **Answer the shared link without an account.** `/i/<token>` shows "Sign in
   to RSVP". Competitors take a name and an email or phone code. A path that
   fits Switchboard's rules: the shared link offers the same account-free
   answer the personal guest link (`/rsvp/<token>`) already supports, creating
   a guest invite on the fly, with an optional "keep me posted" by email or by
   guest-initiated SMS, and the account offer after the answer. The
   recipient-may-answer decision stays in `share-link.ts`; the invariant
   `hostCanShare ⊆ canReadPlan` holds. *Precedent:* Partiful, Luma, Apple
   Invites. *Evidence:* every friction step loses guests, and the guest is the
   next host.
2. **Allow link-only plans.** Let the People step complete with zero invitees
   when the host chooses "I'll share a link". The plan becomes a shareable page
   whose answers fill the guest list. *Precedent:* every invite product.
3. **Make the cascade the smart default for small plans.** When capacity is
   small (one to six seats) or the plan is a coffee, lunch, spare ticket or car
   seat, preselect one-at-a-time or waves and explain it in one line. Keep
   "Everyone at once" one tap away for parties. Retire "The right choice for
   most plans". *Evidence:* principle 1; Flynn and Lake; the spotlight effect
   for hosts.
4. **Say what the cascade does where people meet it.** The wizard step, the
   preview, the landing page and the host's live view should all show the line
   as an object: who has been asked, whose window is open, what happens next.
   Invitees still never see their place.
5. **Unify the invite strings and remove stale promises.** "You are invited"
   (push, member email) vs "You're invited" (links). "One person at a time"
   survives in `src/app/rsvp/[token]/JoinPrompt.tsx` and `appInviteMessage` in
   `src/lib/invitee-contact.ts` although most plans are not one at a time.
6. **Bring the unfurl on brand.** The plan OG card is the most-seen visual and
   uses retired colours. See section 7.3 for the spec.
7. **Instrument the guest funnel.** Section 11 lists the events.

### 6.2 Next: the loops that compound

1. **"Again?" after every plan that happened.** The morning after, each
   attendee privately sees the people they were with and taps who they would
   do it again with. Mutual yeses produce a one-line reveal ("You and Sam both
   want a round two") and a one-tap plan. One-sided yeses are never shown and
   expire. This is Switchboard's version of 222's feedback and Partiful's
   Crush, platonic and plan-shaped. It grows the graph from attendance, which
   today creates no connection, and feeds Mutual, rituals, radar and
   matchmaker. *Evidence:* the liking gap.
2. **Ask attendees, not only the host, whether it happened.** "Mark it
   happened" undercounts. Add a one-tap "We went" to attendees the morning
   after; any confirmed attendee marks the plan happened. This also triggers
   "Again?" and the memory capsule.
3. **Rituals that happen unless cancelled.** "Make this weekly" on any plan
   that happened. Defaults: same place, same time, RSVP optional ("I'm in this
   week"), a quiet "still on?" to the host the day before, skip without guilt.
   Regulars (attended 2 to 3 times) visible only inside the ritual. Co-host
   prompt at three regulars; a "keep it going" prompt to regulars when the host
   goes quiet for two cycles (Meetup's leader-loss failure). Auto-archive
   dormant rituals; show recency, never member counts. *Precedent:* run clubs,
   Timeleft Wednesdays, Heylo. *Evidence:* Hall, Adams, mere exposure.
4. **Follow a host or a ritual by calendar.** A webcal feed per public ritual
   or opted-in host, like Luma Calendars. `src/app/api/calendar` already
   serves personal feeds.
5. **Maybe with a condition.** "Yes if it's after 7", "yes if Sam's going",
   private to the host. Nobody in the field treats Maybe as information.
6. **A clock on every pending state.** Open Table requests, approvals and
   cascade windows show when the person will hear back and resolve to neutral
   on a deadline. *Evidence:* rejection sensitivity; `docs/AUTH.md`'s "no state
   is a dead end", applied to social states.
7. **"I'm free" that matches.** Signals go to chosen people, notify only when
   two signals overlap, show age and expiry inline, fade at half-life. Suggest
   "probably free" from rituals and calendar free/busy, shared only after one
   tap that day. Low social battery hides you from free suggestions without
   telling anyone. *Precedent:* Saturn, Who's Down, Find My.
8. **Pod inside a crowd.** When Open Table attaches to a public event (a run,
   a market, a game), group the joiners into a pod of four to six with a room
   before they arrive. *Precedent:* Pie, run-club pace groups.
9. **Handle cards.** The profile QR encodes a vCard today
   (`src/app/profile/ProfileShare.tsx`). Make it an add-on-Switchboard link with
   an OG card (`INNOVATIONS.md` #16).
10. **Per-host sending breaker.** Pause a host's outbound invites when bounce,
    block or complaint rates spike, with a clear explanation and error code.
    Global and per-recipient caps exist; the per-host layer does not.
    *Precedent:* Luma.

### 6.3 Later

- **Memory capsules that develop.** The capsule opens the morning after, for
  attendees only (Dispo, Lapse). Quarterly private recap with one optional
  shareable card (`INNOVATIONS.md` #19), never counting declines.
- **Plan art.** A per-plan poster or emoji art option rendered into the OG
  card, with one optional effect. Partiful's artifact without its noise.
- **Quiet during the plan.** No non-urgent notifications inside the plan
  window (Dwyer et al.).
- **Pods and rituals as public pages.** Opted-in public rituals get indexable
  topic-and-neighbourhood pages ("Thursday trail run, Sugar House"), Meetup's
  durable SEO asset without its ghost towns.
- **Native shell.** Widgets for "who's free tonight", Live Activities for a
  cascade in progress, an App Clip for RSVP. Android as a TWA. Guests stay on
  the web.

### 6.4 Don't

Each of these appears in a successful competitor and contradicts the product's
promise.

| Don't | Seen at | Why not |
|---|---|---|
| Assign companions without a veto | Timeleft, 222, Pie | Removes consent over who you spend an evening with |
| Auto-connect everyone who attended | Timeleft Connect | The opposite of mutual reveal |
| No-show fees, expulsion, flake scores, public lateness | 222, BeReal | Shame mechanics; they turn rituals into obligations |
| Prepay for friend plans | Timeleft, 222 | Money as pressure on people you already know |
| Hide logistics for drama | Timeleft venue reveal | Withholds what people need to consent safely |
| Public guest lists by default | Partiful, Luma | Stalking and scraping surface. Show counts and people you know. |
| Co-attendance as invite permission | Partiful Mutuals | The documented spam vector |
| Phone number as identity | Partiful | Surveillance framing; Switchboard's guest-initiated SMS is the better story |
| Upload or keep contact books | Saturn, Clubhouse, Down to Lunch | Enforcement target and reputational poison |
| Invite gates to unlock features | Lapse, Down to Lunch | Spends the user's social capital |
| Sell priority, visibility or hints | Meetup+, Gas | Money overriding fairness or anonymity |
| Asymmetric location, location history, stranger dots on a map | Life360, Instagram Map, Wizz | Play becomes control |
| Broadcast "I'm free" to everyone | Down to Lunch | Notification fatigue and public non-response |
| Streaks, badges, "X is waiting for you" | Many | Dark patterns (FTC 2022) |
| Another chat app | Geneva | Chat is a commodity; win the meeting |

---

## 7. Design

### 7.1 What to take from each look

| From | Take | Leave |
|---|---|---|
| Partiful | The invite as an artifact: a poster worth forwarding, a page that is also its own preview | Particle effects everywhere, emoji as UI |
| Luma | Calm craft, one primary action, generated OG cards that look premium for a free meetup | The clinical register for friend plans |
| Apple Invites | Useful context added for you (directions, weather), a shared album | Neutrality; it reads as nobody's |
| Zenly | Delight at the moment of connection; micro-context that reads as conversation | Constant ambient presence |
| Locket, Retro | Small audiences, home-screen presence, weekly rhythm | Nothing |
| Timeleft | Anticipation built by a staged reveal of the fun parts | Hiding what people need to get there |
| When2meet | The heatmap as the answer | Names beside every cell |

### 7.2 Design principles for consent

1. **Visibility is always visible.** Any surface that shares something shows
   who can see it, in words ("Visible to Sam and Ana, 22 minutes left"). This
   answers Instagram Map's "am I visible?" before it is asked.
2. **Private states look private.** A vote, a mutual intent, a give-space entry
   and a decline reason carry the same small lock and the same line ("Only you
   can see this").
3. **Silence never hangs.** Every pending state shows a clock and resolves to a
   neutral end state.
4. **Pausing looks identical to expiring.** Hiding location or a signal must
   not look different from "not sharing right now" to anyone else (Zenly
   freeze; Apple's Hide Location still shows "No Location Found", so do
   better).
5. **Failure is told to one person.** A plan that did not fill is a host-only
   card with a next step.
6. **Delight belongs to mutual moments.** The match, the poll that settles,
   the plan that fills, the ritual's tenth meeting. Motion and haptics there,
   calm everywhere else. Reduced motion respected (already global).
7. **Aggregates are honest about small numbers.** See section 10.4.

### 7.3 The link preview is the brand

The plan unfurl is seen by more people than any screen in the app, most of
whom have never opened Switchboard. Spec for `src/app/api/og/event/[id]`:

- Current tokens only (`--color-terracotta` `#dc2558` family and the brand
  gradient), never the retired `#b0563a`, `#ffd9c7`, `#9a8a7a`. Align the
  welcome card's `#f82a63` too.
- Readable at about 300px wide: title, day and time, area. Never an address or
  guest names; `share-link.ts` decides what may unfurl.
- The plan's cover or art when present; otherwise the plan-card gradient for
  that plan, so a thread of Switchboard links looks like a set.
- Footer: the wordmark and "Plans without the pressure".
- One wordmark across `/welcome`, `/i` and `/rsvp`.

### 7.4 Themes

Afterparty (after Partiful), Guestlist (after Luma) and Prompt (after Hinge)
are well made and contrast-tested. Two cautions:

- The default theme carries the brand. It must stay the most considered look,
  and every external surface (OG cards, emails, the landing page) uses it
  regardless of the viewer's preset.
- Naming a preset after a competitor in docs is fine; never in product copy or
  marketing.

### 7.5 The landing page

`src/app/welcome/page.tsx` has a hero, three cards and a sign-up wall: no
product, no example invite, no mechanics. Rebuild it around one demonstration:

1. Hero line plus one sentence naming the mechanics (section 8.4).
2. A live-looking example: a plan card, then the cascade line filling one
   person at a time, then a private poll settling. The walkthrough scenes in
   `src/components/walkthroughs/TourScenes.tsx` already draw these.
3. The pledge (section 5.4) in plain words.
4. One action: "Start a plan". Sign-up comes when they send it.

---

## 8. Voice

### 8.1 The field

| Product | Register | Example |
|---|---|---|
| Partiful | Lowercase, texting, affectionate, a little bossy | "pls commit soon" |
| Luma | Polite, competent, exact | "Delightful events start here." |
| Apple Invites | Neutral, system | Platform copy |
| Timeleft | Numbers-forward, cheerful, punny city launches | "250 strangers, 5 cities, 1 evening" |
| 222 | Mystique, refusal | "No Swiping, No Profiles, No DMs" |
| BeReal | Anti-influencer | "BeReal won't make you famous" |
| Meetup | Warm, generic, then fee-heavy | "Where interests become friendships" |
| Clubhouse | Gentle exits | "Leave quietly" |

The openings: nobody owns **calm**, and nobody is **specific about privacy**.
Switchboard's best existing lines do both.

### 8.2 Switchboard's voice

Warm, direct, plainly playful, specific about mechanics, honest under failure.
It reassures by saying exactly what will and will not happen. Its best lines
already exist in the code:

- "If you can't make it, that's a complete answer. No hard feelings." (`/i/[token]`)
- "Nobody's feelings were harmed in the making of this RSVP." (`GuestRsvpClient.tsx`)
- "Nothing is revealed unless both sides choose it, and nothing nags." (Home)
- "You got N people together. That's the whole point." (plan page)
- "Can't this time, keep asking!" / "Not really my thing" (`RsvpCard.tsx`)

### 8.3 Rules

1. **Name what the person gets.** (`docs/NAMING.md` rule 1.)
2. **Say who can see it.** Every private act gets one line naming its
   audience.
3. **Never use loneliness as a lever.** No "feeling lonely?", no targeting
   inferred loneliness, no guilt about time since you last saw someone. Name
   the outcome: seeing people.
4. **Failure is kind and goes to one person.** "Nobody could make Thursday.
   That's timing. Try another day?"
5. **Research reassurance, rarely.** One line at the moment of hesitation,
   never as a banner: "People tend to like hearing from someone more than the
   sender expects."
6. **No pressure words.** No "don't miss out", "hurry", "last chance", "X is
   waiting". Deadlines are stated as facts.
7. **House style.** No emdashes (the audit found them in user-facing strings
   and many `features.ts` blurbs); curly apostrophes throughout; sentence case
   (signal presets such as "Down to Hang" and "Coffee Break" are Title Case);
   one name per place (Calendar, Plans and Coming up name one destination;
   Rooms and Living Room name one feature).
8. **No AI-sounding filler.** No "seamlessly", "effortlessly", "elevate",
   "unlock" as marketing verbs, no "it's not X, it's Y" constructions, no
   adverb doing the work of a mechanic.

### 8.4 Rewrites

**Landing hero.** "Make plans. Like magic." names nothing. Options:

- **"Plans without the pressure."** Sub: "Ask one friend at a time, decide
  together in private, and never see a no."
- **"Ask freely."** Sub: "Switchboard asks for you, one person or one wave at a
  time. Nobody sees a no, nobody finds out they were second."
- **"More plans, fewer awkward texts."** Sub: "Invites that go out in your
  order, votes nobody can see, and a room that keeps the details."

**Cascade, wizard step.** Current: "Invite people in your order. When someone
accepts, the invitations stop. Perfect for coffee, lunch, or last-minute
plans." Keep it; it is good. Change the all-at-once card from "The right choice
for most plans" to "Best for parties and big groups."

**Cascade ended with nobody (host only).** "Nobody could make it this time.
Want to try another day, or ask a few more people?"

**Mutual reveal.** "You both said yes. Pick a time?"

**"Again?" prompt.** "Who would you do this again with? Only mutual answers
are shared."

**Reconnection radar.** "It's been a while with Jordan. People tend to like
hearing from someone more than the sender expects." Action: "Say hi" / "Float
a plan".

**Signal.** "Free tonight, 7 to 10. Visible to Close Friends. Ends at 10."

**App-invite text** (`appInviteMessage`): drop the one-at-a-time claim unless
the plan really is a cascade. "I'm using Switchboard to make plans. Answer
whenever, no account needed."

---

## 9. Marketing

### 9.1 What worked in the field

| Channel | Who | Evidence | Switchboard version |
|---|---|---|---|
| The invite link itself | Partiful, Luma | Guests experience the product before hosting | The OG card (7.3) and account-free answer (6.1) |
| Founder presence at the first events | Timeleft (60 dinners incognito) | Learned the product by watching it | Founders at the first 40 hosts' first plans |
| Earned and local media | Timeleft (about 400 press pieces, templated city posts) | Paid ads did not cover costs | SLC local press and newsletters; a story per neighbourhood launch |
| Campus density | Partiful, Saturn, Fizz, Gas, Down to Lunch | School-by-school launches | U of U verified-school pocket in phase 2 |
| Host recruitment and pay | Pie, run clubs, Meetup | Hosts bring their audiences | 40 connector hosts; venue perks for rituals |
| Creator storytelling | Timeleft "dinner with 5 strangers" videos *(unverified attribution)* | A story with suspense | "I asked them one at a time and nobody knew they were second" |
| Calendars and SEO | Luma, Meetup | Subscriptions and indexable pages | Public ritual pages, webcal feeds |

### 9.2 What burned others

- Forced invites (Lapse's five-text gate, Down to Lunch's invite wall).
- Incentivised installs (IRL).
- Contact-book bootstrapping (Saturn's settlement, Clubhouse).
- Influencer-borrowed reputations (Dispo).
- Fear-based or loneliness-based messaging.

### 9.3 Messaging pillars

1. **The asking problem.** "The hardest part of making plans is asking."
   Proof: the cascade and private answers.
2. **The pledge.** Guests free forever, no ads, no data sales, no address-book
   upload, no paid hints. Credible after Partiful's phone-number backlash and
   Life360's data sales.
3. **Plans that happened.** Report outcomes publicly ("N plans happened in
   Salt Lake this month") and never registered users.

### 9.4 SLC specifics

- Separate launch messaging for the two social graphs; dry and Sunday-light
  defaults available without comment.
- Ski season as the forcing event: "Fill the car one seat at a time."
- Outdoor, climbing and run communities as the first rituals.
- Transplant onboarding through Silicon Slopes employers.

---

## 10. Code and engineering patterns

### 10.1 Patterns to copy

| Pattern | From | In Switchboard |
|---|---|---|
| Generated OG card per invite, sized for iMessage | Partiful, Luma | `src/app/api/og/event/[id]/route.tsx`; fix tokens (7.3) |
| Account-free answer with an email or phone code | Partiful, Luma, Apple | Extend the `/rsvp/<token>` guest path to the shared link; decision stays in `share-link.ts` |
| Guest owns the channel; STOP and START | Luma | Already true for SMS (`docs/SMS.md`); keep it true for email and push |
| Per-sender deliverability breaker | Luma | New: per-host rate and complaint threshold beside the existing caps |
| Calendar feeds per host and per ritual, excluding declines | Luma | `src/app/api/calendar` serves personal feeds; add public ritual feeds |
| Free/busy intervals only, never titles | Calendar APIs | Connect-your-calendar should store intervals, not event names |
| Zero-input availability inference, confirmed by one tap | Saturn | Rituals plus free/busy produce a suggestion, never a broadcast |
| Short-TTL location rows, no history, no export | Find My, Zenly | Live map rows expire with the share; enforce in RLS, as other invariants are |
| Contact matching on demand, nothing retained | The Saturn settlement in reverse | Hash, match, discard; never show non-users |
| Embedded payments on Stripe Connect | Partiful | Later, for venue billing and optional ticketing |
| Density thresholds as configuration | Timeleft city launches, Meetup | One config per surface and area, read by the Home pillar gate and the More sheet |
| Founder-run no-code prototype for a new format | Timeleft on Bubble for 16 months | Test new formats (pods, rituals) as configurations of existing tables before building surfaces |

### 10.2 The guarantees that are already the moat

- `poll_votes` and `mutual_intents` are selectable only by their author;
  matching happens in a trigger so a target never learns of unrequited
  interest (`README.md`).
- Every table has RLS; ownership columns frozen; `createAdminClient()`
  re-authorises (`docs/SECURITY.md`).
- `share-link.ts` decides what a link does; `hostCanShare ⊆ canReadPlan`.
- Error codes on every operational failure (`src/lib/errors.ts`).

These are why Switchboard can promise what Partiful and Timeleft cannot: the
privacy claims are enforced where the data lives. Say so in the trust and
safety one-pager.

### 10.3 Every new social surface answers these in code

1. Who can read each row, enforced by RLS, with a pgTAP test.
2. What the other party learns, and when; one-sided intent must be
   undetectable, including through counts, timing and realtime events.
3. What happens on silence: the deadline and the neutral end state.
4. What happens on block, give space and sabbatical.
5. What it costs a guest who has no account.
6. Which analytics event proves it worked (section 11), with no identity in the
   payload.

### 10.4 Aggregates need a floor

An aggregate protects nobody when the group is tiny. `poll_results()`
(`supabase/migrations/20260703120000_init.sql`) returns per-option `score`,
`loves`, `objections` and `voters` to anyone who can view the event, with no
minimum. In a two-person poll, each person can subtract their own vote and read
the other's; the same holds whenever all but one voter compare notes.
`tally_version` bumps on every vote and is published for realtime, so the
timing of a change can also hint at who just voted in a small group.

The principle for every aggregate surface (polls, availability grids, "people
are up for something" signals, zone presence): show exact counts only above a
minimum number of contributors, and below it show a coarser state ("Votes are
in", "Leaning yes") or nothing. "Nobody sees your vote" should be true at every
group size, or the copy should say when it is not. This brief recommends the
principle; the threshold and the change to `poll_results()` are a decision for
the security precedents in `docs/SECURITY.md`.

---

## 11. Metrics

### 11.1 Optimise

| Metric | Definition | Why |
|---|---|---|
| **Plans that happened** (North Star) | A plan reached its time with 2+ confirmed attendees and at least one attendee confirmed it afterwards | The outcome every public-health source cares about; immune to bots |
| People seen | Distinct co-attendees per person per quarter | Breadth across Dunbar layers |
| Repeat pairs | Share of pairs who meet again within 60 days | Adams' repetition; the strongest predictor of durable ties |
| Mutual "again" rate | Share of post-plan prompts with a mutual yes | Quality, and the liking gap closing |
| Ask-to-happen conversion | Proposals that become plans that happened | Whether friction is falling |
| Time to full | Median time from send to a filled cascade | Whether the cascade beats the group chat |
| Guest-to-host conversion | Share of guests who host within 60 days | The viral loop |
| Ritual survival | Rituals alive at 3 and 6 months; rituals that survive a host absence | Durability without nagging |
| Reconnections | Dormant ties (90+ days) that became a plan within 30 days of a radar nudge | Radar's real job |
| Self-reported closeness | Quarterly, optional, one item | A guard against gaming the others |

### 11.2 Refuse to optimise

Time in app, session length, DAU/MAU, notification opens, streaks, invites
sent, contacts uploaded, K-factor as a goal, messages sent, likes on photos,
friend counts, and any revenue from visibility or de-anonymisation. Track
notifications per person per week and unanswered invites older than 72 hours
as costs to drive down.

### 11.3 Events to add

The ten events in `src/lib/analytics/events.ts` cannot see the guest funnel.
Add, server-side and without identity in the payload:

- `invite_sent` (mode, wave, channel)
- `link_opened` (surface: `/i`, `/rsvp`, `/join`; signed-in or not)
- `guest_responded` (path: share link, guest token, SMS; accepted)
- `guest_to_account` (from which path)
- `plan_confirmed_by_attendee`
- `again_answered` and `again_matched`
- `cascade_filled` and `cascade_exhausted` (time to outcome)
- `ritual_created`, `ritual_occurred`, `ritual_archived`
- `signal_sent` and `signal_matched`
- `connection_added` (source: plan, handle, contacts, matchmaker)

Also capture Google OAuth sign-ups, which `signup_completed` misses today, and
apply the anonymity guardrail in `docs/analytics.md` to every new event.

---

## 12. The checklist

Run this before shipping any surface that touches how people ask, answer,
decide, see each other, or find each other. Each line cites the section that
explains it.

1. **Does it make asking cheaper without exposing anyone?** (0, 4.2)
2. **Does it work for a host whose friends have never heard of Switchboard?**
   Guests answer without an account or an install. (6.1)
3. **What does each person learn, and when?** One-sided interest is
   undetectable, including through counts, timing and realtime. Aggregates
   have a floor. (10.3, 10.4)
4. **What happens on silence?** Every pending state has a clock and a neutral
   end. (4.2 principle 5, 6.2)
5. **Who hears about failure?** Only the person who can act on it. (4.2
   principle 6)
6. **Does it need density?** If so, it is gated and invisible below the
   threshold. (5.2)
7. **Does it grow by a real plan or by a toll?** No invite gates, no contact
   uploads, no co-attendance invite rights. (6.4, 9.2)
8. **Could money ever override fairness or anonymity here?** If yes, redesign.
   (5.4)
9. **Is location symmetric, time-boxed, coarse by default, silently pausable,
   and free of history?** (3.4, 6.4)
10. **Does the copy say who can see it, avoid pressure words, and follow house
    style?** (8.3)
11. **Is it on brand on every external surface, especially the unfurl?** (7.3)
12. **Which event proves it worked, and is it outcome-shaped?** (11)
13. **Does `features.ts`, `NAMING.md` and every affected walkthrough agree?**
    (`AGENTS.md`)

---

## Appendix: research memos

Point-in-time research, dated 2026-10-17, kept for its sources. Living product
truth stays in `src/lib/features.ts` and the docs indexed in `docs/README.md`.

| Memo | Covers |
|---|---|
| [`A-strangers.md`](landscape/A-strangers.md) | Timeleft, 222, Pie, Bumble For Friends, Meet5, Hey! VINA, Thursday, newer entrants |
| [`B-invites.md`](landscape/B-invites.md) | Partiful, Luma, Apple Invites, Posh, Evite, Paperless Post, Eventbrite, Facebook Events, Howbout, Heylo |
| [`C-communities.md`](landscape/C-communities.md) | Meetup, Facebook Groups, Discord, Geneva, Heylo, Nextdoor, run clubs, social clubs, mid-sized cities |
| [`D-calendars-presence.md`](landscape/D-calendars-presence.md) | Howbout, Saturn, TimeTree, scheduling polls, Down to Lunch, IRL, Zenly, Bump, Snap Map, Find My, Life360, Instagram Map, PWA limits |
| [`E-psychology-closefriends.md`](landscape/E-psychology-closefriends.md) | BeReal, Locket, Retro, Gas, Lapse, Clubhouse and others; the research on loneliness, friendship formation, asking, rituals and ethical design |
| [`F-strategy.md`](landscape/F-strategy.md) | Funding map, post-mortems, cold start, Salt Lake City, monetisation, distribution, positioning |
| [`S-switchboard-audit.md`](landscape/S-switchboard-audit.md) | This repository at `3c17f65`: features, loops, voice, design, analytics, AI, gaps |

**Still unverified after two passes** (do not use in public copy without a
primary source): Timeleft's €18M ARR and Series A details, Timeleft's
"151 sign-ups" city-launch rule, 222's lead investor, Partiful's $120M
pre-money and any "Wrapped" feature, Luma's 2026 ARR, Apple Invites adoption,
Bump's user count, and the Surgeon General's 150-to-40-minute youth figure.
