> **Research memo, 2026-10-17.** Point-in-time evidence behind [`../LANDSCAPE.md`](../LANDSCAPE.md). Claims carry their verification tags; product truth lives in `src/lib/features.ts`. Do not update this file as the product changes; update `LANDSCAPE.md`.

# D. Social calendars, "who's free", group decisions, and location/presence

Competitive research memo for Switchboard. Prepared 2026-10-17.

**Method and confidence.** Built from ~40 web searches run 2026-10-17. Direct page fetches failed (DNS errors on techcrunch.com and ag.ny.gov), so many claims rest on search-result excerpts of primary sources, not full reads. The session's shared search budget (200 calls) ran out before I covered Doodle/When2meet/LettuceMeet pricing, IRL's product history, or the long tail of 2024-2026 "who's free" apps (Gatherly, Hangs, Amie, Cosmos, Clockwise). Where I fill gaps from prior knowledge I mark it **[prior knowledge, unverified this session]**. Company-reported metrics are labelled as self-reported.

---

## 1. The landscape in one paragraph

This segment splits along two axes. One is **time vs. place**: calendars and polls answer "when are we free?", while maps answer "where is everyone right now?". The other is **ambient vs. explicit**: you can broadcast state and let friends notice it (shared calendar, live dot on a map, "I'm free" toggle), or you can ask a question (poll, invite). The winners at scale sit at the ambient end:

- Snap Map: 350M+ monthly users ([Snap newsroom, 2024-11-14](https://newsroom.snap.com/new-location-sharing-features-family-center)).
- Life360: 95.8M MAU in FY2025 ([10-K](https://www.sec.gov/Archives/edgar/data/1581760/000158176026000016/lifx-20251231.htm)).
- Zenly: about 35M MAU in April 2022 per TechCrunch; Rest of World and Pragmatic Engineer say about 40M at shutdown ([TechCrunch, 2022-04-22](https://techcrunch.com/2022/04/22/how-zenly-made-social-maps-cool-again-and-whats-next); [Rest of World](https://restofworld.org/2022/fearing-competition-snap-decided-to-shut-down-zenly-rather-than-sell-it/)) [V, figures conflict; cite "35M to 40M"].
- Howbout: more than 4M MAU, self-reported ([TechCrunch, 2024-09-13](https://techcrunch.com/2024/09/13/howbout-raises-8m-from-goodwater-to-build-a-calendar-that-you-can-share-with-your-friends); [ctol.digital](https://ctol.digital/news/howbout-raises-8m-in-funding-for-social-calendar-app)) [V, self-reported; other coverage says about 5M downloads, so do not mix the two].
- Saturn: about 17,000 US high schools supported. Snap told Engadget that around 80% of US high schoolers attend a school Saturn supports ([TechCrunch, 2025-06-20](https://techcrunch.com/2025/06/20/snap-acquires-saturn-a-social-calendar-app-for-high-school-and-college-students); [Social Media Today](https://www.socialmediatoday.com/news/snap-acquires-student-scheduling-app-saturn/751266/)) [V-corrected: 80% is students at supported schools, not 80% of schools, and supported does not mean using].

Explicit "I'm free" toggle apps have a long record of spiking and dying. Down to Lunch (2015-16) and Google's Who's Down (2015) are the examples. Switchboard is trying to fuse the two: ambient signals with the rejection-softening of explicit, low-stakes asks. The history below explains why that fusion is the right bet, and where it breaks.

---

## 2. Social calendars

### 2.1 Howbout (London, 2019-)

**Core loop.** You connect Apple or Google Calendar, which imports your busy blocks. Then you share your whole calendar with friends, see overlays of when friends are free, propose a plan, let the group vote on it, and chat inside the event ([TechCrunch, 2024-09-13](https://techcrunch.com/2024/09/13/howbout-raises-8m-from-goodwater-to-build-a-calendar-that-you-can-share-with-your-friends)). The moment of value comes when you open a friend's calendar and see a gap that matches yours, so the "are you free?" text never has to be sent.

**Psychology.** CEO Neil Tanna describes the problem as the planning itself: making plans is "draining" because of the effort of finding a time and then agreeing on an activity and a place. He says Howbout exists to move people "from planning to a made plan" ([tech.eu, 2022-11-02](https://tech.eu/2022/11/02/a-ps192-million-raise-for-social-planning-app-howbout-that)). His thesis line, "sharing your time is the next stage of connection", is what Howbout bets on. TechCrunch reported that more than 75% of users share their full calendar with at least one friend, and that Gen Z users are "very happy to share their entire calendar" (same TechCrunch article). This is the rejection-avoidance mechanic in its purest form: asking someone who is visibly free carries far less social risk.

**Design language.** Calendar overlays with friends' busy and free blocks, voting on proposed plans, and in-event chat. Howbout's marketing now segments heavily by audience, with landing pages for [fraternities](https://howbout.app/fraternities), [sororities](https://howbout.app/sororities), [families](https://howbout.app/families) and [couples](https://howbout.app/couples). That suggests the pure "friends" use case needed help retaining. It also publishes SEO comparison posts against TimeTree, Cozi and OurCal ([example](https://howbout.app/blog/apps-you-need/howbout-vs-timetree-which-shared-calendar-is-actually-best/)).

**Growth and funding.** £1.92M seed round in November 2022, when it had passed 500K downloads ([tech.eu](https://tech.eu/2022/11/02/a-ps192-million-raise-for-social-planning-app-howbout-that); [UKTN](https://www.uktech.news/funding/howbout-funding-20221102)). $8M Series A led by Goodwater Capital, announced 2024-09-13, with FJ Labs, Sequel and footballer Harry Maguire joining and existing backers Boost Capital and Angel Invest following on. TechCrunch puts the total raised at more than $13M; CB Insights shows $11.03M ([Silicon Canals](https://siliconcanals.com/social-calendar-app-howbout-secures-e7-1m/); [CB Insights](https://www.cbinsights.com/company/howbout/financials)) [V, total conflicts]. Self-reported scale: 4M+ MAU, 50M events supported, mostly users under 25 ([Howbout blog](https://howbout.app/blog/howbout-moments/we-raised-8m-in-funding-led-by-goodwater-/)) [V, self-reported].

**Business model.** Freemium, with a paid Howbout+ subscription ([marlvel.ai tracker, updated 2026-04-16](https://marlvel.ai/apps/howbout-shared-calendar); third party, unverified detail).

**Failure modes.** The same tracker reports user backlash over an **invite-only onboarding barrier** and privacy concerns, against a 4.8/5 rating from about 59.7K reviews. The structural risk: a calendar overlay is only as good as the fraction of friends who have imported their real calendars. Most under-25s do not keep a calendar for social life, so friends' calendars look empty. An empty calendar falsely reads as "free".

### 2.2 Saturn (high school social calendar; acquired by Snap in June 2025)

**Core loop.** Saturn auto-builds your **school schedule** (rotation days, block schedules, lunch waves, advisory periods) and absorbs snow days and delayed starts. Then you see which friends share your class or your free period ([App Store listing](https://apps.apple.com/us/app/saturn-calendar/id1454483188)). The moment of value is opening the app and learning that your friend has the same lunch wave or a free period right now. This is availability inference that needs **zero user input**, because the school timetable *is* the calendar. That makes it the most important precedent in this memo.

**Engagement.** Saturn says "more than 30% of our users interact with a friend on Saturn daily, usually to see when they are free" ([Saturn updates, 2024-05-27](https://www.joinsaturn.com/updates); self-reported). It shipped "Cal Compare" v2 in March 2024, which it calls "our most popular feature for sharing calendars with friends". It also added an Activity Center for friend requests, birthdays and invites, and one-tap recurring extracurriculars ("create every sports practice for the entire season").

**The quote Switchboard should frame.** From the same Saturn post: "We believe the stigma around calendaring with friends on incumbent platforms like iCal and Google Calendar is rooted in email, rather than the calendar itself." Saturn's response was to let users invite anyone from their contacts via text, iMessage, Snap or Instagram. In other words, the calendar was never the problem; the channel was.

**Growth.** School by school, with paid Campus Leads who recruit teams of 5-10 ambassadors, hold a marketing budget, and earn "bonuses as your campus hits growth milestones" ([EdTech Jobs listing](https://edtechjobs.io/jobs/116180426-campus-lead)). At the start of each school year, ambassadors explain their school's schedule to Saturn staff ([Inklings News, 2022-02-14](https://inklingsnews.com/b/2022/02/14/students-collaborate-with-saturn-to-ensure-the-apps-success)). The ARK Invest podcast with co-founder Dylan Diamond describes organic growth plus ambassadors, and a move from web app to iPhone app ([ARK](https://ark-invest.com/podcast/breaking-down-classroom-walls-with-saturns-dylan-diamond/)). That web-to-native path is relevant for a PWA.

**Scale and funding.** Saturn was founded in 2018 by Dylan Diamond (CEO) and Max Baron. It announced more than $44M raised in August 2021 from General Catalyst, Insight Partners and Coatue, with Jeff Bezos and Marc Benioff among the angels ([Insight Partners](https://www.insightpartners.com/ideas/saturn-the-calendar-based-social-platform-raises-44-million/)) [V]. Its undated careers page later claimed more than $65M ([General Catalyst jobs](https://jobs.generalcatalyst.com/companies/saturn-technologies/jobs/33240632-campus-lead)) [V]. The "more than $62M" attributed to the NY AG document ([NY AG AOD PDF](https://ag.ny.gov/sites/default/files/settlements-agreements/state-of-new-york-v-saturn-technologies-assurance-of-discontinuance-2025.pdf)) (unconfirmed after recheck). Reach was "over 1M high schoolers" in a job ad and "available at 17,000+ high schools" per its listing and Snap. **Snap confirmed the acquisition on 2025-06-20** at an undisclosed price; the "$44M" in some aggregator headlines is Saturn's 2021 funding, not the price. Just under 30 full-time staff joined Snap, and the app continues standalone while Snap plans to bring its calendaring "into Snapchat" ([TechCrunch](https://techcrunch.com/2025/06/20/snap-acquires-saturn-a-social-calendar-app-for-high-school-and-college-students); [heise](https://heise.de/-10455327)) [V]. Snap now owns the leading teen location map *and* the leading teen social calendar.

**Failure mode: the NY AG settlement (announced 2025-03-07) [V].** The settlement terms and findings:

- **Penalty:** $650K in penalties and costs. Kelley Drye reports that $200K was payable and $450K suspended; other summaries report only the $650K headline ([NY AG press release](https://ag.ny.gov/press-release/2025/attorney-general-james-announces-settlement-app-developer-failing-protect-young); [Kelley Drye](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/new-york-ag-settles-with-school-calendar-app-saturn)) [V; quote as "$650,000 ($450,000 suspended)" only with the AOD in hand].
- **Broken verification:** Saturn stopped authenticating high school email credentials in 2021. Users from different schools, and people who were not students, could then message students, despite earlier assurances.
- **Contact books:** Saturn copied users' contact books and kept using them after users revoked access.
- **Ambassadors:** The AG also cited the student-ambassador promotion and poor record-keeping.
- **Also cited:** no age screening to confirm users were high-school age ([Sheppard Mullin](https://www.sheppard.com/insights/blogs/new-york-ag-settles-with-school-app)) [V].
- **Required remedies:** limit what is shown about students who are *not* Saturn users, let teachers block their names from class schedules, delete retained contact copies, hide under-18 users' personal information until they accept new terms, prompt under-18 users to review privacy settings every six months, and certify compliance annually for five years ([Hunton](https://hunton.com/privacy-and-information-security-law/ny-attorney-general-reaches-650-000-settlement-with-student-social-networking-app-developer-over-privacy-violations); [Frankfurt Kurnit](https://technologylaw.fkks.com/post/102k6zb/new-york-attorney-general-reaches-settlement-with-saturn-technologies-over-school)) [V; teacher-blocking and five-year certification not re-seen this pass].

**Lesson:** contact-graph bootstrapping and "shadow profiles" of non-users are now an enforcement target. Verification promises must be kept continuously, not only at launch.

### 2.3 TimeTree (Tokyo)

TimeTree is a shared calendar built mostly around couples, families and groups, not friend discovery. It reported 40M registered users in August 2022 ([TimeTree newsroom](https://timetreeapp.com/intl/en/newsroom/2022-08-10/40-million)). It later reported 67M+ registered users and 13B+ scheduled events as of September 2025, plus a round led by SK Telecom that brought its total raised to about ¥6.7B ([The Bridge](https://thebridge.jp/en/2020/01/calendar-sharing-app-timetree-fundraised); the round's size is inconsistent across trackers). No MAU figure is disclosed. **Lesson:** shared calendars retain best inside *closed, small, high-obligation* groups such as households and couples. Loose friend networks are a harder fit, which is why Howbout is adding family and couple pages.

### 2.4 Incumbent baseline: Google Calendar, Apple Calendar, Fantastical

Google's working hours and working location are Workspace-only features. Personal accounts get a single booking page, and only Workspace can check several calendars for availability ([Google Workspace](https://workspace.google.com/products/calendar/)). Personal-account "Find a time" against friends' free/busy was not confirmed in this session's sources. Calendar sharing is per-calendar and per-person through settings ([Google blog](https://blog.google/products/calendar/make-most-your-day-7-google-calendar-tips/)). **[Prior knowledge, unverified this session]** Fantastical's Openings and Proposals features and Apple's iCloud shared calendars serve the same jobs but run on email-addressed invites. Saturn argues that email is exactly what makes calendaring with friends feel stiff. The incumbents' gap for Switchboard to fill: **ICS export in, chat-native invites out.** Read busy blocks from the user's calendar for inference, but never make friends live in a calendar app.

---

## 3. Group-decision tools (polls and availability grids)

**[Mostly prior knowledge; the search budget ran out before verification.]**

- **When2meet:** A free, ad-light, no-account grid. You drag-paint your availability over a time grid, and a heatmap of group overlap appears. Its staying power with students comes from zero friction: no login, one link, and the heatmap *is* the answer. The UX is famously dated, which shows that function beats polish for this job.
- **Doodle** (Zurich, 2007; later owned by TX Group/Tamedia): Date polls with yes, no and if-need-be options. Over time it added more ads and pushed users toward paid tiers, which led to the common "Doodle alternative" search behaviour ([Toolradar, 2026](https://www.toolradar.com/blog/doodle-poll-alternative)). Doodle Pro costs about $6.95 per user per month ([Railway Rallly template](https://railway.com/deploy/rallly-self-hosted); vendor page).
- **Rallly:** Open-source and self-hostable (Next.js and Prisma), with no account needed to vote. The hosted free tier deletes polls after a period of inactivity, and Pro costs about $7/month for persistent polls and calendar invites when a time is finalized ([Toolradar](https://www.toolradar.com/blog/doodle-poll-alternative)). The license is reported as AGPLv3 by one source and MIT by another, so it is unverified.
- **LettuceMeet:** A When2meet-style grid with Google Calendar import, popular with students. Its current status is unverified.

**Psychology.** Every one of these tools exposes the *names* next to the votes. Who answered "no" and who never answered are both visible, which carries a social cost the tools never address. None offer anonymity, and none separate "can't make it" from "don't want to". That is Switchboard's opening: **private, anonymous** polls and grids that reveal only the aggregate ("4 of 6 can do Thursday") remove the cost of being the person who cannot make it.

**Moment of value:** the heatmap cell lights up darkest. The best practice to copy from these tools: **no account required to respond**, and one link that works in any chat app.

---

## 4. "I'm free" availability signal apps

### 4.1 Down to Lunch (2015-2016)

- **Origin and mechanic:** Stanford graduates Joseph Lau and Nikil Viswanathan built it in one afternoon and launched it in August 2015. Lau: "We literally made the simplest app we could think of, which was one button" ([TechCrunch, 2015-08-26](https://techcrunch.com/2015/08/26/this-one-afternoon-project-could-change-how-you-meet-friends/)). You picked a status ("Lunch", "Dinner", "Chill", "Study"), friends were notified, and interested friends chatted to finalize ([Dealroom summary](https://app.dealroom.co/companies/down_to_lunch)).
- **Growth:** It spread campus by campus ([BYU Universe, 2016-01-22](https://universe.byu.edu/2016/01/22/students-across-campus-are-asking-each-other-are-you-down-to-lunch/); [Notre Dame Observer, 2016-01](https://ndsmcobserver.com/2016/01/92913/)) and reached No. 2 in the US App Store ([SCMP](https://amp.scmp.com/tech/social-gadgets/article/1940358/startup-reaches-no-2-us-app-store-despite-human-trafficking)). Growth was driven by a **gamified invite wall**: you had to recruit friends to unlock activity categories such as "Blaze" or "Beer Pong", which produced spam complaints.
- **Death:** On 2016-02-24 a screenshot of a weeks-old App Store review calling it a covert trafficking app was tweeted, and high-volume accounts amplified it on February 25 and 26. [Snopes](https://www.snopes.com/down-to-lunch-trafficking/) found it baseless. SCMP reported the app had already slid from its No. 2 peak into the 40 to 50 range ([SCMP](https://amp.scmp.com/tech/social-gadgets/article/1940358/startup-reaches-no-2-us-app-store-despite-human-trafficking)). [Ypulse](https://www.ypulse.com/?p=17409) (May 2016) reported user growth fell 90% over two days [V, single source for the 90%]. The company told TechCrunch the smear "massively" hurt its user base and rankings, and by May 2016 it was talking to investors after falling down the charts ([TechCrunch, 2016-05-17](https://techcrunch.com/2016/05/17/down-to-lunch-has-met-with-investors-about-raising-funding)) [V]. That it was gone from the stores by 2018 (unconfirmed after recheck).
- **Diagnosis:** The smear was the proximate cause, but a pure "I'm free" toggle has three structural problems underneath:
  1. The signal is only valuable when several friends are free in the same window, which needs local density.
  2. Each broadcast notifies everyone, so notification fatigue arrives within weeks.
  3. Nothing durable is created, because a status expires and leaves no plan, no memory and no reason to return tomorrow.
- **Trust fragility:** Meeting strangers via app was close enough to the product that a trafficking rumour felt plausible. Any app that turns signals into physical meetups is one viral rumour away from collapse unless its trust story is visible and legible.

### 4.2 Google "Who's Down" (2015)

Google tested an invite-only app with a slider that marked you "down to hang" for about 3 hours ([Digital Trends / 9to5Google coverage](https://www.apptunix.com/blog/google-launches-a-new-app-whos-down-to-track-friends/)). It never launched widely. Even Google could not make the toggle sticky. **Takeaway: expiry was right, but expiry alone does not create a habit.**

### 4.3 The 2024-2026 long tail

The App Store has many small entrants with few ratings:

- [2gether](https://apps.apple.com/cd/app/2gether/id6748619581) ("see who's free at the moment and ready to hang out").
- [Down2Chill](https://apps.apple.com/bh/app/down2chill/id6444803295) (pick a "vibe").
- [CatchApp: Availability Toggle](https://apps.apple.com/us/app/catchapp-availability-toggle/id6738431468) (free for a *call*).
- "Free" (statuses Going Out / Flexible / Busy).
- [Campify](https://apps.apple.com/us/app/campify/id6754953635) (shows when friends are on campus).
- [Scout](https://apps.apple.com/us/app/id1248594415) (passive geofence alerts).

None shows evidence of scale. **Unverified / not researched due to search budget:** Gatherly, Hangs, Amie, Cosmos, Clockwise-for-friends concepts. The pattern holds: dozens of toggle apps and no breakout. **The toggle is a feature, not a product.**

### 4.4 Beli (adjacent: social taste graph)

Beli makes you rank restaurants against ones you have already ranked, using pairwise comparisons that turn into a 10-point score. It shows a "friend rating" averaged across your friends, and only your followers can see your ratings ([NYU News, 2023](https://nyunews.com/culture/dining/2023/10/16/beli-app?print=true); [Food Network](https://www.foodnetwork.com/fn-dish/news/beli-app-trend)). As of August 2026 it reported 120M+ ratings across 2M venues in 50K cities ([Boston Globe, 2026-08-04](https://www.bostonglobe.com/2026/08/04/lifestyle/beli-restaurant-rating-app/)). Over 80% of users join via referral ([Ivey Business Review](https://www.iveybusinessreview.ca/magazine/articles/beli)). Monetization is minimal: no in-feed ads by design, and a Supper Club test in NYC. **Lesson for "mutual-interest matching":** comparative, low-effort, gamified input builds a taste graph that *makes the next plan easy* ("you both rank X highly"). A friends-only audience removes performative pressure.

### 4.5 IRL (2016-2023): the fake-network cautionary tale

- **What it was:** IRL started as a social calendar and event app and grew into messaging-based group chat. It raised about $200M, including a $170M Series C led by SoftBank Vision Fund 2 at a $1.17B valuation ([TechCrunch, 2023-06-26](https://techcrunch.com/2023/06/26/irl-shut-down-fake-users/)).
- **The shutdown:** In June 2023, a board investigation found that 95% of its roughly 20M claimed MAU were "automated or from bots", and the company shut down.
- **The charges:** In July 2024, the SEC charged CEO Abraham Shafi with portraying the growth as organic while spending millions on incentivized-download ads ([TechCrunch, 2024-07-31](https://techcrunch.com/2024/07/31/founder-behind-social-media-app-irl-charged-with-fraud); [tech.co](https://tech.co/news/unicorn-irl-95-users-fake-shuts-down)). The founders countersued, claiming the 95% figure was a pretext. The penalty exposure in the criminal case is unverified.
- **Lessons:** Social-plan apps can buy installs, but they cannot buy *friends who are free at the same time*. Vanity MAU hides the only metric that matters here: **plans that actually happened between people who know each other**. Event-discovery feeds also attract bots and spam far faster than friend-graph features.

---

## 5. Location and presence apps

### 5.1 Zenly (Paris, about 2015 to 2023-02-03; shutdown date [V] via [AlternativeTo](https://alternativeto.net/news/2022/12/zenly-social-mapping-network-shutting-down-on-february-3rd-2023/) and [TechCrunch, 2022-12-05](https://techcrunch.com/2022/12/05/zenly-was-the-best-social-app-and-it-will-sadly-shut-down-on-february-3rd/))

**Scale:**

- Snap bought Zenly in 2017 for $213M, when it had "a few hundred thousand" monthly users ([Pragmatic Engineer](https://blog.pragmaticengineer.com/zenly/)).
- It grew to about 35M MAU by April 2022 ([TechCrunch, 2022-04-22](https://techcrunch.com/2022/04/22/how-zenly-made-social-maps-cool-again-and-whats-next)), or about 40M per Pragmatic Engineer and Rest of World [V, figures conflict].
- Data.ai ranked it the 10th most-downloaded social app globally in March 2022 ([TechCrunch, 2022-09-01](https://techcrunch.com/2022/09/01/zenly-is-still-hugely-popular-so-whys-snap-shutting-it-down)).
- Its strongest markets were Japan, Vietnam, Indonesia and Russia, where Snapchat was weak and ad monetization was low (Pragmatic Engineer).

**Why it died.** It was not for lack of love. Snap cut about 20% of staff in August 2022 to save around $500M a year and shut Zenly instead of selling it, citing the "low likelihood" of it ever turning a meaningful profit [V]. [Rest of World](https://restofworld.org/2022/fearing-competition-snap-decided-to-shut-down-zenly-rather-than-sell-it/) and [Waxy](https://waxy.org/2022/09/snap-shuts-down-zenly-instead-of-selling-it-fearing-competition) attribute this to fear of competition. It had no revenue model. Users ran petitions to save it.

**Why people loved it (design).**

- **The map was the product.** TechCrunch described the older app as "full of rainbow colors, animated emojis and playful design elements". The 2022 redesign darkened profiles and chat and was criticized as "more serious" ([TechCrunch, 2022-12-05](https://techcrunch.com/2022/12/05/zenly-was-the-best-social-app-and-it-will-sadly-shut-down-on-february-3rd/)).
- **Its own map engine:** Zenly spent three years building it, with 3D landmark models and water-splash effects, to make "a more fun map" ([TechCrunch, 2022-05-18](https://techcrunch.com/2022/05/18/social-maps-app-zenly-rolls-out-its-own-maps/amp/); [woshipm](https://www.woshipm.com/it/5589731.html)).
- **Ambient micro-context instead of raw coordinates:** friends' **battery level, speed, and time spent at a place** (also listed in [Bump's App Store copy](https://apps.apple.com/us/app/-/id6471519217)). These details told stories ("at 4%", "been at the library 3h", "moving fast") rather than only marking positions. They made the map feel like gossip, not surveillance.
- **Bump:** shake phones together to record that you hung out, a playful proof of togetherness.
- **Ghost mode:** per-friend options to blur your location or freeze it at a point ([Qustodio guide](https://www.qustodio.com/en/blog/is-zenly-safe-for-kids/)). This mattered because **socially deniable** privacy (frozen or fuzzy, not "X stopped sharing with you") avoids the confrontation that a visible off-switch creates. The exact options (Precise / Fuzzy / Frozen) are prior knowledge, unverified.
- **[Prior knowledge, unverified]:** chunky, bubbly 3D avatars, haptic and bouncy micro-animations, and leaderboard-like "best friend" signals.
- **Co-founder Antoine Martin** framed it as "very personal, very contextual and very social": "when lockdown rules are lifted, when people go out again, they need Zenly" (TechCrunch, 2022-04-22).

**The Zenly diaspora:**

- **Amo** (Paris, founded 2023 by Antoine Martin and Michael Goldenstein) raised an $18M seed round, reportedly led by New Wave with Coatue and DST participating ([Dealroom](https://dealroom.co/companies/amo/); [TechCrunch, 2023-02-06](https://techcrunch.com/2023/02/06/zenly-co-founder-returns-with-new-social-app-company-amo)). Amo first shipped *ID*, collaborative profile boards ([Sifted, 2023-11](https://sifted.eu/articles/amo-frances-hottest-social-media-app)).
- **Bump** ("hang with friends IRL", "from the Zenly team ... loved by 100s of millions") is Amo's map app. It shows friends' battery, speed and dwell time, detects places automatically, has chat, and lets you **shake to notify friends you're together** ([App Store](https://apps.apple.com/us/app/-/id6471519217)). The French listing's subtitle is "va voir tes amis IRL" ("go see your friends IRL"). A third-party tracker listed it at No. 57 in US App Store Social Networking on 2026-03-12, rated 4.8 from about 4.8K reviews; Google Play shows about 4.65 from about 69K reviews ([App Pricing Lab](https://apppricinglab.com/app/apple/6471519217)) [V, third party]. Amo has disclosed no MAU for Bump, and the "100s of millions" in its listing refers to Zenly, not Bump (unconfirmed after recheck for any user count). In a 2024 survey, 38.2% of Japanese university students said they wanted to try Bump, mostly because of the Zenly team's track record ([Web担当者Forum, 2024-10-11](https://webtan.impress.co.jp/n/2024/10/11/47900)).
- **Japan's post-Zenly wave:** NauNau was built by a Waseda student in about two weeks after the shutdown announcement and launched in October 2022 ([Waseda Weekly, 2023-05-16](https://www.waseda.jp/inst/weekly/news/2023/05/16/108076/)). Whoo, from LinQ, got MIXI's conditional investment of up to about ¥2B in April 2023. In a 2023 survey of high schoolers, 42.7% had used Whoo and 19.6% NauNau ([Penmark survey](https://www.commercepick.com/archives/39507)).
- **Others:** Life360 claimed a download surge from Zenly refugees, with no numbers given ([Life360 blog](https://www.life360.com/blog/what-happened-to-zenly)), and MixerBox BFF, iSharing and Snap Map also absorbed users.
- **Lesson:** a beloved presence product leaves a **portable habit** that users urgently re-home. Speed and a credible lineage won over feature parity.

### 5.2 Snap Map (2017-)

Snap Map has 350M+ monthly users. Location sharing is **off by default** and only possible with accepted friends. Users who share with all their friends get prompts to review that choice, and a pop-up appears when you add someone who may be outside your real-life network. In November 2024, Snap added Family Center features: parents can request a teen's live location, get arrival and departure alerts for up to three places, and see which friends the teen shares with ([Snap newsroom, 2024-11-14](https://newsroom.snap.com/new-location-sharing-features-family-center)). Snap Map launched on 2017-06-21, built on technology from the Zenly acquisition, with Bitmoji "Actionmoji" avatars that update only when the user opens Snapchat. Sharing choices were all friends, selected friends, or Ghost Mode, and Ghost Mode was the default ([The Next Web](https://thenextweb.com/apps/2017/06/21/snapchat-snap-maps-feature/); [Snopes](https://www.snopes.com/2017/06/23/snapchat-introduces-snap-map/)) [V]. **Lesson:** even the largest friend-location product treats "who am I sharing with" as something to **re-prompt periodically**, and has added a parental layer.

### 5.3 Instagram Map (August 2025)

Instagram Map launched 2025-08-06. It shows a friend's *last active* location to a chosen audience and requires "double consent" ([Social Media Today](https://www.socialmediatoday.com/news/instagram-reiterates-that-location-sharing-is-not-switched-on-by-default/757162)). Backlash was immediate. Users on Threads reported seeing their location even with Instagram's location permission off. Part of the confusion was that the map also gathered older location-tagged posts that had never been shown together before. Women's safety was a prominent theme in coverage (a Glamour piece syndicated by Yahoo), though "led by women and survivors" is that coverage's framing rather than a measured fact. Adam Mosseri said sharing requires "double consent" and that Instagram was "re-checking" the rollout "to make sure nobody shares location without explicitly deciding to do so." A bipartisan group of 37 state attorneys general asked Meta to disable the feature for minors, and two US senators urged Zuckerberg to drop it ([Yahoo/Glamour](https://www.yahoo.com/news/articles/instagram-map-why-women-angry-163813276.html); [Storyboard18](https://www.storyboard18.com/social-media/instagrams-new-map-feature-triggers-safety-fears-meta-blames-misunderstanding-78562.htm); [PR Daily](https://www.prdaily.com/instagram-map-rollout-worries-users-senators/); [babl.ai](https://babl.ai/state-ags-warn-instagrams-new-map-feature-puts-children-at-risk/)) [V-corrected: "re-checking" was Mosseri's word, and the AG and senator responses are added]. **Lesson:** perception is the product. If users cannot tell at a glance whether they are visible, they assume they are. A follower graph (asymmetric, partly strangers) is the wrong graph for location.

### 5.4 Apple Find My (incumbent)

Apple's sharing tiers ([Apple Support](https://support.apple.com/en-gb/105104); [HT213894](https://support.apple.com/en-il/HT213894)):

- **One-time:** send your location once in Messages or Maps.
- **Time-boxed:** share from Messages for **one hour, until end of day, or indefinitely** ([AppleWorld, 2026-08](https://appleworld.today/2026/08/how-to-send-and-share-your-location-in-ios-26-and-ipados-26/)).
- **Live Location:** shows direction and speed.
- **Check In:** shares location **only if you are late and don't respond**. That is a superb pattern: location as a safety fallback rather than an ambient feed.

iOS 27 (shipped September 2026) adds a per-person "Hide Location" toggle in Find My that pauses sharing for up to 12 hours (early betas said until end of day) *without notifying* the other person, then restores previous settings; there are also custom sharing durations ([9to5Mac, 2026-09-29](https://9to5mac.com/2026/09/29/ios-27-find-my-adds-new-ways-to-hide-your-location-more/); [MacRumors, 2026-06-18](https://www.macrumors.com/2026/06/18/ios-27-find-my-features-hide-location/)) [V-corrected]. One nuance: the viewer sees "No Location Found" rather than a last-known position, so a hidden share is silent but not invisible. Apple has adopted a partial form of Zenly's socially deniable privacy. **Lesson:** time-boxed and conditional sharing, not "always on", is now the platform default mental model.

### 5.5 Life360 (family safety)

**Metrics and model.** FY2025: 95.8M MAU (+20%), 2.8M Paying Circles, $489.5M revenue (+32%), subscription revenue of $369.3M, and its first full year of profit. Net income was $150.8M, of which $118.4M was a one-time non-cash tax benefit, so it was $32.5M excluding that ([10-K](https://www.sec.gov/Archives/edgar/data/1581760/000158176026000016/lifx-20251231.htm); [Q4 2025 release](https://investors.life360.com/news-releases/news-release-details/life360-reports-record-q4-2025-results)) [V; subscription revenue figure not re-seen]. "Other revenue" (+90% to $68.4M) includes data and ads. It also acquired Nativo, an ad-tech firm, in January 2026. The business is **parents paying for safety**, not friends sharing for fun.

**Failure modes:**

- **Data sales:** The Markup (2021-12-06) found Life360 sold precise location data to about a dozen data brokers (Cuebiq, X-Mode, SafeGraph, Arity). "De-identification" left coordinates and ad IDs intact ([The Markup](https://themarkup.org/privacy/2021/12/06/the-popular-family-safety-app-life360-is-selling-precise-location-data-on-its-tens-of-millions-of-users)). **[Prior knowledge, unverified]** Life360 then said it would curtail precise-data sales.
- **Stalking:** A 2023 class action alleges that Tile, owned by Life360, enabled stalking. In one case an abuser pinged a victim's Tile 16,385 times ([The Record](https://therecord.media/lawsuit-alleges-tile-tracker-blocked-law-enforcement); [ABC13](https://abc13.com/post/tile-device-woman-stalked-by-ex-amazon-stalking-and-harassment/13701804/)). These are allegations.
- **Teen surveillance:** About half of US parents track teens. A Baylor study found that tracking itself is not necessarily harmful, but tracking "without healthy boundaries and communication" harms the relationship ([Baylor, 2024](https://robbins.baylor.edu/news/story/2024/different-kind-halloween-safety-briefing-peek-effects-tracking-applications-can); [2026 syndicated feature](https://www.news4jax.com/tech/2026/03/30/tracking-teens-when-safety-becomes-surveillance/)).

**Lesson for Switchboard:** the moment a friend-location product can be repurposed for *asymmetric* monitoring (parent to teen, partner to partner), its emotional valence flips from play to control. Switchboard should make asymmetry impossible by design.

### 5.6 Teen friend-finding (Hoop, Wizz): a boundary marker

Wizz, a swipe-to-befriend app for teens, was pulled from both app stores in January 2024 after NCRI ranked it the third most-used app for sextortion, behind Instagram and Snapchat ([NBC News](https://www.nbcnews.com/tech/social-media/wizz-tinder-app-aimed-teens-removed-apple-google-stores-rcna136607)). It returned to the App Store about a month later after adding chat warnings and mandatory selfie verification, and Canada's Cybertip.ca still advised parents to remove it ([WHIO](https://www.whio.com/news/national/wizz-friend-finding/YSDFSLIB4WA7E65POQJLSIOPNM/); [NBC News](https://www.nbcnews.com/tech/tech-news/canadas-child-safety-watchdog-warns-parents-wizz-tinder-app-teens-rcna138732)) [V]. **[Prior knowledge, unverified]** Hoop is a similar Snapchat-adjacent friend-swiping app. **Lesson:** any feature that surfaces *strangers* near a minor, including serendipity zones and check-ins, is a regulatory and safety hazard. Keep discovery to mutual-friend or opt-in contexts.

### 5.7 Radiate (event co-attendance)

Radiate connects people going to the same events. It started at music festivals and later covered "25,000+ venues every week" ([Wikipedia](https://en.wikipedia.org/wiki/Radiate_(app)); [BusinessWire, 2024-01-18](https://www.businesswire.com/news/home/20240118834310/en)). It was early described as "Tinder and Twitter for events" ([Harvard Crimson, 2015](https://www.thecrimson.com/flyby/article/2015/11/17/tinder-for-harvard-yale/)). **Lesson:** co-presence at a *shared plan or event* is a safer, more meaningful trigger than raw proximity. This is relevant to "find each other at a plan".

---

## 6. Technical notes for a PWA

1. **No background location on the web.** Service workers cannot access `navigator.geolocation` ([W3C thread](https://lists.w3.org/Archives/Public/public-webapps-github/2016Jul/0065.html)). On iOS, a backgrounded PWA is effectively paused, so `watchPosition` stops ([W3C device APIs, 2021](https://lists.w3.org/Archives/Public/public-device-apis-log/2021Apr/0043.html)). Developers also report `watchPosition` stalling for minutes even in the foreground ([Ionic forum](https://forum.ionicframework.com/t/pwa-geolocation-watchposition-pauses/231595)). Standalone mode has had permission-prompt bugs ([Apple forum](https://developer.apple.com/forums/thread/694999)), and older Safari locked out geolocation permanently after one denial ([W3C thread, 2023](https://lists.w3.org/Archives/Public/public-device-apis-log/2023Jan/0017.html)). The recheck found no 2025 or 2026 WebKit change allowing background geolocation for web apps, but also no current Apple documentation stating the limit, so treat "foreground only" as observed behaviour to test on the target iOS version (unconfirmed after recheck as official policy). **[Prior knowledge]** There is no web Geofencing API (abandoned), and Periodic Background Sync is Chromium-only with no iOS support.
2. **What this means:** Switchboard's live location can only be **foreground, session-based sharing**. It updates while the app is open, then goes stale. **That is a feature, not a bug.** Design it as "live while I'm on my way" with a visible freshness timestamp. Do not pretend to be Zenly-continuous. The "find each other at a plan" flow is the ideal fit: a 20-minute window, with the app open, around a meeting point.
3. **Native comparison [prior knowledge]:** iOS offers "Always" authorization, significant-location-change, region monitoring (about 20 regions per app) and visits. Android 10+ requires a separate `ACCESS_BACKGROUND_LOCATION` permission and a location-type foreground service. Battery cost is the classic complaint about Zenly, Life360 and Find My. NauNau marketed non-GPS positioning for lower battery use ([moneypost](https://www.moneypost.jp/997623)). Saturn and Bump both went native. If Switchboard ever needs ambient presence, that is the point where a native shell becomes necessary.
4. **Push:** iOS 16.4+ supports Web Push for Home Screen web apps only. Sites open in a Safari tab cannot request push permission, and each installed web app must ask permission itself ([9to5Mac, 2023-02-16](https://9to5mac.com/2023/02/16/iphone-web-app-new-features-ios-16-4/); [Notificare](https://notificare.com/blog/2023/02/20/Web-Push-is-coming-to-iOS/)) [V]. Getting users to install to the home screen is therefore a gating funnel step for any "friend is free" notification.
5. **Calendar sync:**
   - Read: Google Calendar API OAuth for free/busy, or a subscribed ICS URL (works for Apple and Outlook but refreshes slowly, often hours).
   - Write: ICS download, `webcal://` subscription feeds, and "Add to Google Calendar" deep links. Saturn's insight applies: deliver invites over chat, not email.
   - Store only busy/free intervals, never event titles. That is the privacy-preserving default, and it is what "free/busy" scope was designed for.
6. **Availability inference without input (Saturn's trick):** derive "probably free" from structure, such as recurring rituals, imported busy blocks, typical hours, and the last time a signal was set. Present it as a *suggestion to confirm* ("You're usually free Thursday evenings. Tell friends?"), never as an auto-broadcast.

---

## 7. Psychology synthesis

- **Ambient awareness beats asking.** Saturn reports 30% daily friend interaction, mostly checking "when they are free". Howbout reports 75%+ sharing full calendars. Zenly and Snap Map reach massive scale. Passive visibility removes the cost of the first ask.
- **Rejection avoidance is the real job.** "Are you free?" risks a no. Seeing that someone is free, or seeing an anonymous aggregate, lowers that risk to zero. Down to Lunch failed despite having this insight, because broadcasting "I'm free" to everyone is itself exposure: no one responds, and you feel unpopular. The signal must reach a chosen few and fail silently.
- **Spike then die.** Toggle apps spike on novelty and campus virality, then die because of: (a) density thresholds, meaning too few friends are free at the same time, (b) notification fatigue, (c) no artifact left behind, (d) stale signals that erode trust ("it said she was free, she wasn't"), and (e) a single trust shock (Down to Lunch's rumour, Instagram Map's backlash).
- **Location reads as play when it is symmetric, consensual, contextual and deniable** (Zenly). It reads as **control when it is asymmetric** (Life360 parent to teen), **ambiguous** (Instagram Map), or **monetized** (Life360's data sales).
- **Always-on fatigue:** constant visibility creates obligation ("you were nearby, why didn't you say hi?"). Freeze and fuzzy modes, and Apple's silent hide, exist because people need *plausible deniability* to stay comfortable sharing at all.

---

## 8. (a) Ten most transferable lessons for Switchboard

1. **Infer availability from structure, then ask to confirm.** Saturn's daily engagement comes from zero-input timetables. Switchboard's equivalents are standing rituals, imported free/busy blocks and recurring patterns, which can pre-fill "probably free Thu 7-10pm: share?". One tap, never auto-broadcast.
2. **Chat-native, not email-native.** Saturn's "stigma is rooted in email" insight. Every invite, poll and "I'm free" ping should be a link that renders beautifully in iMessage, WhatsApp and Instagram DMs. No account needed to answer, which is the lesson of When2meet and Rallly.
3. **Aggregate, anonymous answers are the moat.** No incumbent poll tool hides who said no. "4 of 6 free Thursday" beats a named grid for low-pressure groups.
4. **Signals must expire and show their age.** Who's Down's 3-hour slider and Find My's one-hour and end-of-day options are the right primitives. Show "set 40 min ago, until 9pm". A stale signal does more damage than no signal.
5. **Micro-context over coordinates.** Zenly's battery, speed and dwell time made the map feel like conversation. Switchboard can show "at the plan", "on the way, ~10 min" or "nearby" instead of a pin on a street.
6. **Socially deniable privacy.** Zenly's freeze and fuzzy modes and iOS 27's silent hide (which still shows "No Location Found", so Switchboard can do better). Pausing or blurring must never notify the other person or look different from "not sharing right now".
7. **Make each signal produce an artifact.** Down to Lunch left nothing behind. Every "I'm free" that matches should collapse into a plan, and every plan should leave a memory (attended, ritual streak) that gives a reason to return.
8. **Density before breadth.** Saturn grew school by school, Down to Lunch campus by campus. Launch per friend group or circle (the cascading invite), and measure "plans that happened among mutuals", not MAU. IRL is the warning.
9. **Location is a time-boxed tool for a plan, not a feed.** The PWA's foreground-only limit matches what users trust: Find My's Check In and Bump's "you're together" moments. "Find each other" for 30 minutes around a plan is the sweet spot.
10. **Personality matters.** Zenly's playful map and its darker 2022 redesign show that warmth is retention. A calm brand still needs delight in the moment of match: haptics, a bounce, a two-avatar animation when friends' free windows overlap.

## 9. (b) Five traps

1. **The broadcast toggle.** An "I'm free" that pings all friends produces spam, the sting of public non-response, and churn (Down to Lunch, Who's Down, the long tail of toggle apps). Signals go to chosen people and only notify on a *match*.
2. **Contact-book hoarding and shadow profiles.** The NY AG penalized Saturn for copying contacts and keeping them after access was revoked, and for exposing data about non-users. Hash and match contacts on demand, delete unmatched entries, and never show non-users.
3. **Asymmetric or stranger-facing location.** The Life360 parent-teen dynamic, Tile stalking allegations, Wizz sextortion, and Instagram Map's follower-graph backlash. Location must be mutual, between confirmed friends, time-boxed and revocable. Serendipity zones should never reveal individual strangers' positions.
4. **Faking or buying the network.** IRL's 95% bots and Down to Lunch's invite walls. Incentivized installs do not create overlapping free time. Gamified invite gates create spam that poisons the brand.
5. **Monetizing location data or building on unprofitable presence.** Life360's data-broker exposure and Zenly's "loved but unmonetized" death. Decide early that location is never sold. Find revenue in plan utility (premium rituals, group features) or a native tier, so a future owner has no incentive to kill or sell it.

## 10. (c) Making "I'm free" and live location safe, fresh and worth opening daily

**Safety (no surveillance):**

- **Mutual, opt-in and per-person, with no asymmetric mode at all.** No "request someone's location" for parents, partners or anyone else. Viewing someone's location requires that you are sharing yours with them right now.
- **Time-boxed by default:** 15 min, 1 h, or "until the plan ends". There should be no "forever" option. Auto-stop when the plan ends or after N hours, and send a quiet recap: "Sharing ended at 9:40pm."
- **Precision tiers:** "at the plan / nearby / on my way / in [neighbourhood]" by default. Exact position appears only inside a "find each other" window at a plan location.
- **Silent pause and fuzz.** Pausing must not notify anyone and must look identical to an expired share.
- **Visible state:** a persistent indicator whenever any share is active, naming who can see you ("Visible to Sam, Ana · 22 min left"). This answers Instagram Map's "am I visible?" anxiety before it starts. Periodically re-prompt about who you share with, as Snap does.
- **Server-enforced in the database (RLS):** no stored location history beyond the live window, short TTL rows, no export, and no data sales, ever. State this policy on the page itself. Block or report in one tap ends all sharing instantly.
- **Minors and strangers:** no proximity discovery of non-friends. Serendipity check-ins show aggregates ("3 friends checked in here this week"), never individual live dots of strangers.

**Freshness:**

- Every signal carries an age and an expiry, both shown inline. Faded styling after 50% of its life; gone at expiry.
- Accept that PWA location is foreground-only. Label it honestly ("last seen 4 min ago, app closed") instead of implying continuity.
- Refresh availability from calendar free/busy (sync or ICS) before showing "probably free". Never show inferred free time to others without the user's one-tap confirmation that day.

**Worth opening daily (without nagging):**

- **A morning or evening "window" card:** "You and 2 friends are free tonight 7-10" appears only when there is a real match. Saturn's daily rate came from passively checking friends' gaps, so make that check rewarding and quick, with no push unless there is a match.
- **Matches, not broadcasts.** Notify only when your signal overlaps someone else's ("Ana is also free tonight"), and cap notifications per day.
- **Ritual hooks:** standing rituals ("Thursday dinner") create a weekly reason to check in, and an auto-suggested poll keeps them alive without anyone being the organiser.
- **Delight at the match:** a Zenly-style playful animation when two availabilities meet, and a "you're together" moment at the plan (Bump's shake) that leaves a small shared memory.
- **Social battery as a filter, not a status to perform.** Low battery quietly hides you from "free" suggestions without announcing it. Deniability keeps people honest about being free on the days they are.

---

### Gaps to close in a follow-up (search budget exhausted)
- Doodle, When2meet and LettuceMeet current pricing, ads and status.
- IRL's original calendar product details.
- Bump's 2024-2026 rankings and MAU.
- Gatherly, Hangs, Amie, Cosmos and Clockwise.
- Whether iOS 27's Hide Location shipped as described.
- Current Web Push and geolocation behaviour in iOS 26/27 standalone PWAs, confirmed from WebKit release notes.

## Verification pass 2026-10-17

A second pass covered the high-stakes app facts using web search only. WebFetch and direct HTTPS failed for every host tried, so confirmations rest on search excerpts of primary pages, press and law-firm summaries. Tags added inline: [V] confirmed, [V-corrected] text changed, "(unconfirmed after recheck)" still open.

**Corrections:**

- **Saturn's "80%":** this is not 80% of US high schools. Snap's wording is that about 80% of US high schoolers attend a school Saturn *supports* (about 17,000 schools). Support is not usage.
- **Saturn funding:** $44M was announced in August 2021 (Insight Partners release) and the careers page later said $65M+. The "$62M per NY AG" figure could not be confirmed. Aggregator headlines saying "Snap acquires Saturn for $44M" are wrong: the price was undisclosed.
- **NY AG settlement:** confirmed as announced 2025-03-07 for $650K. The "$450K suspended" split comes from Kelley Drye only. Added remedies: hide under-18 users' data until they accept new terms, a six-monthly privacy review prompt for minors, and the lack of age screening.
- **Instagram Map:** "re-checking" was Mosseri's statement, not a separate Meta statement. Added that 37 state AGs asked Meta to disable it for minors and that two senators objected. The "led by women and survivors" framing was softened to what coverage supports.
- **iOS 27 Hide Location:** it shipped. It pauses sharing for up to 12 hours without notifying the other person, but the viewer sees "No Location Found", so it is silent but not indistinguishable.
- **Zenly MAU:** sources conflict (35M in TechCrunch April 2022, about 40M per Rest of World and Pragmatic Engineer). Cite "35M to 40M". The 2023-02-03 shutdown and Snap's "low likelihood of meaningful profit" rationale are confirmed.
- **Down to Lunch:** the rumour began with a tweeted screenshot on 2016-02-24 and was amplified February 25 and 26. The 90% growth drop is single-source (Ypulse). "Gone from stores by 2018" is unconfirmed.

**Confirmed [V]:** Snap's acquisition of Saturn confirmed on 2025-06-20 (just under 30 staff, standalone app); Howbout's $8M Series A on 2024-09-13 and its self-reported 4M+ MAU (total raised $13M+ per TechCrunch, $11.03M per CB Insights); Snap Map launch 2017-06-21 with Ghost Mode as the default; Life360 FY2025 figures (net income $150.8M including a $118.4M one-time tax benefit); Wizz's return to the App Store about a month after its January 2024 removal; iOS 16.4 Web Push limited to Home Screen web apps; Bump's March 2026 rank (No. 57, Social Networking, third-party tracker).

**Still open:** Bump MAU (none disclosed); official WebKit or Apple documentation of the PWA background-geolocation limit (forum evidence only, and no sign of change); Doodle, When2meet, LettuceMeet, Rallly pricing and licence; IRL's calendar-era product; Gatherly, Hangs, Amie, Cosmos; Google Who's Down details.
