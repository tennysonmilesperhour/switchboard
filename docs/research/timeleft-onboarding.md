# Timeleft onboarding research, and what Switchboard should take from it

Researched 2026-10-14. Purpose: decide what to change in Switchboard's
onboarding and profile creation, based on how Timeleft interviews new users to
match them into dinner tables of six.

**Source caveat.** The research environment could not open pages directly, so
everything below comes from search-engine snippets of the cited pages. Quotes
are near-verbatim. Timeleft does not publish its questionnaire ("publishing
them would invite people to game the algorithm"), so the question list is
pieced together from reviewers. Labels: **[verified]** means a named source
says it; **[inferred]** is a reading of the evidence.

---

## Part 1. How Timeleft interviews and matches

### 1.1 Flow

Timeleft's own description: **Basics -> personality quiz -> pick format and
date -> subscribe to unlock booking** [verified,
https://timeleft.com/blog/how-does-timeleft-work/]. A Medium review describes
logistics first (language, diet, nationality), then personality
[verified, https://brianwongjh.medium.com/my-timeleft-review-whats-great-and-what-could-be-improved-505b9c578fd8].
The live onboarding URL includes `stepId=desired-feelings`, which suggests a
newer step asking what the person wants to feel or get out of it [inferred].

Length: Timeleft now calls it a "2 min quiz". In early 2025 a Pratt IxD
critique called it "unnecessarily drawn out" with **no option to skip**
[verified, https://ixd.prattsi.org/2025/02/design-critique-timeleft-app/].
Reviewers cite 30 questions in 2024. The 2026 Play Store notes say
"Refreshed onboarding. Better profiles." It was shortened [inferred].

### 1.2 What it asks

Profile basics: date of birth, gender, email (these three are not editable in
app, only via support), plus profession or industry, relationship status,
kids, nationality, religion, zodiac sign.

Personality and values items reported by reviewers:

| Theme | Reported item | Source |
|---|---|---|
| Thinking style | Do you form opinions from "logic and facts" or "emotions and feelings"? | Vice, Vreme |
| Social energy | Introverted or extroverted | Axios DC, Medium, Timeleft blog |
| Humor | How comfortable are you with politically incorrect humor? / How important is humor to you? | Vulcan Post, Time Out Austin |
| Conversation limits | Do you like to talk about politics? Would you discuss religion? | Columbus review, Vulcan Post |
| Planning | Planner or spontaneous | Columbus review |
| Ideal night | "What best describes an ideal night?" | Time Out Austin |
| Values | Importance of family, spirituality, challenge, humor | Timeleft algorithm post (2023) |
| Lifestyle | How often you work out, kids, relationship, movies, music | Axios DC, Kansas City Mag |
| Self-ratings | Introversion, creativity, stress, spirituality, loneliness | Philadelphia Inquirer (attribution unconfirmed) |

Chosen **per booking, not on the profile** [verified, help center]: budget
($ / $$ / $$$, "indicative"), meal options, language (one or both), dietary
preferences, neighborhood, event type (dinner, women-only dinner, run, coffee,
drinks, last drinks).

### 1.3 How answers are used

From Timeleft's help center and blog [verified]:

- Factors: personality compatibility, language, age range, budget tier, event
  type. Diet is used to pick the venue, not the people.
- **"Profession, nationality, and relationship status are not used."** They
  are still asked.
- Goal: "a compatible, varied group, not six people with identical profiles."
  Explicit rules from 2023: a mix of introverts and extroverts, gender balance
  where possible, a 5 to 7 year age spread (later "within 10 years whenever
  feasible").
- Not for romance: "doesn't match on romantic compatibility."
- Raw answers are never shown to tablemates.
- In new cities constraints are relaxed; in mature cities more data is used.
- Profile edits change future matches without re-registering.

### 1.4 Reveal and in-event mechanics

- Night before or morning of: tablemates' **industries and zodiac signs**
  (sometimes nationality and languages). Venue is revealed the day before "on
  purpose"; table number one hour before.
- At start time an in-app icebreaker game unlocks. One phone is passed around.
  Example prompt: "Explain your job to the table as if you were talking to a
  5-year-old."

### 1.5 Feedback loop

- After the event, each guest rates the experience and their compatibility
  with each person; this "refines future matches".
- **Connect**: send a request to anyone you want to stay in touch with.
- **Impressions**: leave a note on what made each person stand out; you see
  your own impressions only after you leave yours (reciprocity-gated).
- 2025 additions: Repeat (meet people you already met again) and "+1" (bring a
  friend to your first dinner).

### 1.6 What people criticize and praise

Criticized:
- Long, mandatory quiz with no skip (Pratt).
- Shallow questions, zodiac in particular.
- Doubts that the answers matter at all ("matches you with whomever is close
  enough"), and age mismatches cited on Trustpilot (3.2/5).
- Asking things it admits it does not use.
- Seeing the same people repeatedly; no control over gender mix.

Praised:
- Well-matched tables when it works, and similar ages.
- The shared quiz becomes a conversation topic ("everyone took the same test").
- Icebreakers lower the cost of starting.

### 1.7 Competitors, for contrast

- **222**: around 30 questions, 15 to 60 minutes, very invasive (income,
  orientation, politics, ZIP). Learns mainly from post-event ratings and says
  it needs about 5 events per member.
- **Pie**: short assessment after RSVP, groups of 6, group chat before the
  event.

**Takeaway:** the quiz itself is not Timeleft's moat. What works is (a) a
short, values-and-energy interview whose purpose is group *composition*, (b)
logistics asked at the moment of booking, (c) a staged reveal that builds
anticipation, and (d) a post-event feedback loop that does most of the real
learning.

---

## Part 2. Where Switchboard is today

Onboarding (`src/app/onboarding/OnboardingForm.tsx`, action
`completeOnboarding` in `src/lib/actions/profile.ts:264`):

1. Name, handle, covenant and terms checkboxes.
2. Optional `interests` and `down_to` chip pickers.
3. Username accounts only: optional recovery email.

The matching machinery behind it is much richer than what onboarding feeds:

- `discovery_selves`: per lane (friends, dating, networking) `enabled`, `bar`,
  `visible_to`, `seeking`, `blurb`, and dating-only `identifies_as` /
  `interested_in`.
- `discovery_weights`: 0 to 100 per interest, down_to, school, or employer, per
  lane.
- `discovery_mood`, `discovery_signals` (private accept/pass history),
  `profile_facts` with vouches, `identity_facets` (behavioural),
  `compatibility_between` (consented), `matchmaker_proposals` (masked until
  both accept).

Onboarding seeds only `interests` and `down_to`. Every lane, weight, bar and
blurb starts empty or at defaults until someone finds `/discover/preferences`.
**This is the main gap.** Timeleft gets people to state intent and style in
the first two minutes; Switchboard asks what they like but not what they are
here for or how they like to be with people.

Switchboard also differs from Timeleft in ways that rule some ideas out:

- The core product is plans among people you already know. Meeting strangers
  is opt-in (`PRODUCT.md`), and discovery is off by default.
- `PRODUCT.md` forbids revealing private interest before both sides consent.
- `docs/AUTH.md`: onboarding is the only way out of onboarding, so every new
  question must be skippable and can never block.
- `docs/SECURITY.md`: anything sensitive (values, conversation limits) needs
  owner-only RLS and a security-definer read path, never a self-writable rank.

---

## Part 3. Recommendations

Ordered by value for effort.

### R1. Add an intent step: "What are you here for?"

Timeleft's `desired-feelings` step and its 2026 refresh both point the same
way: ask intent first, it shapes everything after.

- Multi-select cards: **Plans with people I already know** (preselected),
  **Meet new friends**, **Dating**, **Networking**.
- Picking a meet-new card writes `discovery_selves.enabled = true` for that
  lane, but `profiles.discoverable` stays false until a one-line confirmation
  on the same card ("People outside your circles can find you in Discover. You
  can turn this off any time."). Consent stays explicit, per `PRODUCT.md`.
- Dating asks `identifies_as` / `interested_in` inline, both optional.
- Everything after this step branches on it: someone who picked only the
  first card never sees R3.

### R2. Ask for a top three, and seed weights from it

Today interests are a flat list, so `discovery_weights` start blank.
Timeleft's lesson is that a few strong signals beat many weak ones.

- After the existing picker: "Which three matter most to you?" (tap to star).
- Starred items get a high weight (for example 80) in each lane the person
  enabled in R1; the rest keep the default. `suggestWeightChanges`
  (`src/lib/discovery-lanes.ts:324`) can refine from there.
- Cap free-text and total counts in `completeOnboarding`; today `interests`
  and `down_to` are accepted with no limit or whitelist
  (`src/lib/actions/profile.ts:278`).

### R3. A short "how you like to hang" card set (meet-new lanes only)

This is the useful core of Timeleft's quiz, cut to what Switchboard would
actually consume. Six cards, one tap each, all skippable, about 60 seconds.

| Card | Options | Who uses it |
|---|---|---|
| Social energy | Recharge alone / Recharge with people / Depends | Group composition: mix, as Timeleft does |
| Group size | One on one / Small group (3 to 6) / The more the merrier | Matchmaker, Open Table seat size |
| Pace | Planner / Spontaneous / Either | Suggest scheduled plans vs. Signals and Zones |
| Conversation | Light and fun / Deep / Mix | Open Table and Shared Moments composition |
| Leave at the door | Politics / Religion / Work talk / None | Icebreaker filtering in rooms, composition |
| Best time | Weekday evenings / Weekends / Daytime | Suggestion timing, Radar |

Rules taken from Timeleft's mistakes:

- **Every question names its consumer.** If no code reads it, do not ask it.
  Timeleft lost trust by asking profession, nationality and relationship
  status and then saying none are used. Put the consumer in a comment next to
  each card definition, and a test that fails if a stored key has no reader.
- **No zodiac, no DOB, no gender in this step.** Gender is already captured,
  dating-only, in `discovery_selves`.
- **Private by default.** Stored in a new owner-only table (`hang_style` or
  similar), read only through security-definer functions that return derived
  results, never raw answers. Same rule Timeleft states: tablemates never see
  your answers.
- **Show the person what it does.** After the last card, a summary: "We will
  use this to balance groups you join and to pick icebreakers. Change it in
  Settings > How you hang." Timeleft's biggest complaint was "I doubt the
  answers matter."

### R4. Keep logistics per plan, with profile defaults

Timeleft asks budget, diet and language at booking, not on the profile. Do the
same, with a default.

- A plan or Open Table seat asks budget tier ($ / $$ / $$$) and dietary needs
  when they matter. Settings can hold a default so it is one tap.
- This overlaps `docs/INNOVATIONS.md` #12 (Comfort and Access Preferences);
  build them together.

### R5. A staged reveal for stranger plans

For matchmaker proposals and Open Table seats, Timeleft's night-before teaser
maps onto Switchboard's masked identity:

- Before both accept: show shared items only ("You both starred climbing and
  are down to grab coffee"), from data both people already marked
  discoverable.
- After both accept: names and room.
- Never reveal R3 answers directly. Derived hints only ("This table leans
  toward deep conversation").

### R6. Icebreakers that use what we know

Timeleft's game is praised for starting conversation and criticized for being
too personal and for one-phone logistics.

- In a plan room for a stranger or mixed group, offer 3 prompts drawn from
  shared interests and filtered by "Leave at the door".
- Each phone gets its own copy, no passing around.
- Prompts start light; deeper prompts only if the group's conversation card
  leans deep.

### R7. A post-plan feedback loop that does the real learning

222 and Timeleft both learn more from post-event ratings than from the quiz.
Switchboard already has `discovery_signals`.

- After a stranger or mixed plan: "Would you hang with them again?" per
  person, private.
- A mutual yes surfaces as a connection suggestion, like Timeleft's Connect.
  It reuses the `check_mutual_match` pattern, so no one learns a one-sided no.
- Feed the yes/no into `discovery_signals` and `suggestWeightChanges`.
- Optional reciprocity-gated impressions ("what stood out"): you see yours
  only after you leave one. This fits the consent rule in `PRODUCT.md`.

### What not to copy

- A mandatory quiz, or a paywall at the end of onboarding.
- Fields locked behind support (Timeleft's DOB and gender).
- Zodiac and other questions with no consumer.
- No control over group makeup. Switchboard should keep audience controls
  (`visible_to`, `seeking`) and Give Space.

---

## Part 4. Suggested onboarding flow

| Step | Content | Required | Who sees it |
|---|---|---|---|
| 1 | Name, handle, covenant, terms (unchanged) | Yes | Everyone |
| 2 | What are you here for? (R1) | No; defaults to plans with people I know | Everyone |
| 3 | Interests and down_to, then a top three (R2) | No | Everyone |
| 4 | How you like to hang (R3) | No; one Skip for the whole step | Only people who chose a meet-new lane |
| 5 | Recovery email (unchanged) | No | Username accounts |

The expected time stays around two minutes for most people, and about three
for someone opting into discovery.

---

## Part 5. Repo obligations for whoever builds this

- `docs/AUTH.md`: every new step needs a Skip that still completes
  onboarding. Error routing in `OnboardingForm.tsx` must return to the step
  holding the bad field.
- `docs/SECURITY.md`: a new table for R3 needs RLS, `WITH CHECK` on update,
  and owner-only reads. Add pgTAP coverage.
- `src/lib/features.ts`: add entries for "How you hang" and the feedback
  loop. `features.test.ts` fails without them.
- `src/lib/walkthroughs.ts`: no current tour shows onboarding or profile
  setup, so nothing breaks. A new step in the `people` tour for the intent
  and hang-style cards would be worth adding when R3 ships.
- `src/lib/errors.ts`: any new operational failure in `completeOnboarding`
  needs an `SB-` code.
- Analytics: extend `onboarding_completed` with which lanes were enabled and
  whether R3 was skipped, so we can see whether the extra step costs
  completion.

## Open questions to settle in the app itself

These could not be confirmed from public sources. Going through Timeleft's
onboarding at app.timeleft.com would answer them:

1. The exact answer widgets (scales, sliders or option lists).
2. Whether a personality result is ever shown to the user.
3. What the `desired-feelings` step asks.
4. How the dinner game uses quiz answers.

## Sources

- Timeleft blog: https://timeleft.com/blog/timeleft-personality-quiz/ ,
  https://timeleft.com/blog/how-does-timeleft-work/ ,
  https://timeleft.com/post/timeleft-algorithm-the-maestro-of-your-dinners/ ,
  https://timeleft.com/blog/how-to-book-timeleft-first-dinner/
- Timeleft help center: https://help.timeleft.com/hc/en-150/articles/27949262857244-How-Does-Timeleft-Match-Me-With-a-Group ,
  https://help.timeleft.com/hc/en-150/articles/19207416110748-How-to-Select-and-Confirm-Your-Dinner-Preferences-Budget-Meal-Options-and-Language ,
  https://help.timeleft.com/hc/en-150/articles/16452188157212-How-Profile-Changes-Affect-Matching-at-Timeleft ,
  https://help.timeleft.com/hc/en-150/articles/14236214182044-Change-or-Update-Your-Profile
- Reviews and press: Axios DC https://www.axios.com/local/washington-dc/2024/08/18/timeleft-app-dinner-friends-dc ,
  Vice https://www.vice.com/en/article/timeleft-friend-finding-platform-review/ ,
  Vulcan Post https://vulcanpost.com/867937/timeleft-dinner-with-strangers-review-malaysia/ ,
  Time Out Austin https://www.timeout.com/usa/news/heres-what-happened-when-i-dined-with-five-strangers-in-austin-031225 ,
  Kansas City Magazine https://kansascitymag.com/every-wednesday-six-strangers-meet-for-dinner-should-you-join/ ,
  Pratt IxD https://ixd.prattsi.org/2025/02/design-critique-timeleft-app/ ,
  Medium https://brianwongjh.medium.com/my-timeleft-review-whats-great-and-what-could-be-improved-505b9c578fd8 ,
  Arab News https://www.arabnews.com/node/2587429/saudi-arabia ,
  Trustpilot https://www.trustpilot.com/review/timeleft.com
- Competitors: TechCrunch on 222 https://techcrunch.com/2022/11/14/2440702/ ,
  TechCrunch on Pie https://techcrunch.com/2025/03/04/andy-dunns-new-app-pie-uses-ai-to-help-you-make-friends
