> **Research memo, 2026-10-17.** Point-in-time evidence behind [`../LANDSCAPE.md`](../LANDSCAPE.md). Claims carry their verification tags; product truth lives in `src/lib/features.ts`. Do not update this file as the product changes; update `LANDSCAPE.md`.

# Segment A: Apps that match strangers into small in-person groups

Research memo for Switchboard. Compiled 2026-10-17.

## Method and confidence

- About 30 web searches were run before the session's shared search budget ran out. Direct page fetches (WebFetch, curl) were blocked by the sandbox proxy for every host tried: timeleft.com, techcrunch.com, thewalrus.ca, globaldatinginsights.com. Every claim below therefore comes from search-result excerpts of the cited URLs. I did not read the full pages.
- Confidence tags used throughout:
  - **[V]** Verified against at least one cited excerpt.
  - **[C]** Sources conflict. Both values are given.
  - **[U]** Unverified this session: background knowledge from before mid-2026, or a lead named in the brief that I could not confirm. Treat [U] as a hypothesis to check, not a fact.
- I could not verify Timeleft's or 222's visual design (colors, typography, screens) because their sites and app listings could not be fetched. The design notes say so explicitly.
- Named in the brief but not found in any result: "Tuesdays", "Kindred", "Clyde", and Pie in Boston. They are listed as open leads in section 7.

---

## 1. Timeleft (Paris; dinners with 5 strangers on Wednesdays)

### Company facts

- **Founders and history [V]:**
  - Maxime Barbier (CEO) and Adrien de Oliveira, his former marketing director.
  - The company was formed in September 2020. It began as a lockdown-era platform for "sharing dreams" and pivoted four times.
  - In 2023, out of cash, the founders gave themselves 15 days to test one last idea: dinners between strangers. Sources: [Innovators Uncensored](https://innovatorsuncensored.beehiiv.com/p/how-this-start-up-pivoted-4-times-in-3-years-before-they-made-their-first-sale), [Connexion France](https://www.connexionfrance.com/news/how-to-meet-new-people-over-dinner-in-france-we-try-out-new-app/682998), [Timeleft about page](https://timeleft.com/?p=2472).
- **Founder-led ethnography [V]:** In Lisbon, Barbier "would rush around Lisbon every Wednesday, dropping off card games and other activities at restaurants." He also attended the first 60 dinners incognito to watch the product work. ([Connexion France](https://connexionfrance.com/news/new-trend-serves-companionship-up-on-a-plate-in-france/682998))

### Core loop

1. **Quiz instead of a profile [V].**
   - The quiz takes about two minutes. It covers family, values, humor, and introversion vs extroversion. ([Timeleft blog: personality quiz](https://timeleft.com/blog/timeleft-personality-quiz/))
   - A sample item reported by Vice: "Are your opinions usually guided by logic and facts, or emotions and feelings?" ([Vice](https://www.vice.com/en/article/timeleft-friend-finding-platform-review/))
   - Rappler says the quiz also asks about interests, work, and star sign. ([Rappler](https://www.rappler.com/life-and-style/relationships/things-to-know-timeleft-app/))
2. **Book a Wednesday [V].**
   - Dinner starts at 7 p.m. and the fee is per seat. Each guest pays for their own food. ([6AM City sponsored guide](https://daltoday.6amcity.com/food/go-to-dinner-with-strangers-in-dallas-with-timeleft))
   - Dinners run about three hours. ([nexspark review 2026](https://nexspark.org/journal/timeleft-review))
   - Wednesday is a deliberate weekly-routine choice ("our core dinner night since launch"), and some cities have moved to **biweekly** Wednesday dinners as a test [V] ([Timeleft help: Why Wednesdays](https://help.timeleft.com/hc/en-150/articles/14235873503132-Why-Are-Timeleft-Dinners-on-Wednesdays-And-What-s-New)).
   - Table size [C]: most sources say six (you plus five strangers), but TechCrunch (Apr 2026) says Timeleft "matches users with four other people" ([TechCrunch](https://techcrunch.com/2026/04/05/as-people-look-for-ways-to-make-new-friends-here-are-the-apps-promising-to-help/)).
3. **Staged reveal [V-corrected].**
   - The day before, guests learn about their tablemates (industries, zodiac signs, "demographic breakdowns" by percentage) plus safety tips. ([Axios Denver](https://www.axios.com/local/denver/2024/08/28/timeleft-app-denver-dinner-friends), [6AM City Boston](https://bostoday.6amcity.com/food/go-to-dinner-with-strangers-in-boston-with-timeleft))
   - The help center says an email arrives 24 hours before the event "prompting you to check the app for your assigned restaurant information," and the table number is "visible in your app 1 hour before the event." ([Timeleft help: How to book](https://help.timeleft.com/hc/en-150/articles/21421898168348-How-to-Book-an-Event-on-the-Timeleft-App))
   - The restaurant name and location are withheld until the morning of the dinner. This is now consistent across sources ([Tasting Table](https://www.tastingtable.com/1859085/dinner-parties-with-strangers-timeleft), [6AM City Dallas](https://daltoday.6amcity.com/food/go-to-dinner-with-strangers-in-dallas-with-timeleft)); the nexspark "12 hours ahead" figure is the outlier. Read the sequence as: group profile the day before, venue the morning of, table number one hour before.
   - The App Store listing mentions Live Activity countdowns on the lock screen before an event [V] ([App Store](https://apps.apple.com/app/id6466442949), via search snippet).
   - A Trustpilot complaint says the late reveal makes it "impossible to get there" for some people. ([Trustpilot](https://www.trustpilot.com/review/timeleft.com?page=9))
4. **The night [V].**
   - The table is 4 to 6 people. In the early days icebreaker card games were dropped off at the restaurant; reviews mention icebreakers that unlock in the app.
   - A medium-spend venue is chosen by area and typical budget.
5. **"Last Drink" [V].**
   - At about 8 p.m., roughly an hour into dinner, the app reveals a nearby bar.
   - The bar is shared with every Timeleft table in the area, which turns a 6-person dinner into a larger mixer. It is optional.
   - Sources: [6AM City](https://bostoday.6amcity.com/food/go-to-dinner-with-strangers-in-boston-with-timeleft), Reddit r/denverwomen.
   - A Reddit user noted there is "no clear way to tell who else attended Timeleft at the restaurant or bar."
   - The help center calls it "Last Drinks" and describes it as an optional get-together after dinner [V] ([Timeleft help](https://help.timeleft.com/hc/en-150/articles/27949169792924-What-Events-and-Subscription-Plans-Does-Timeleft-Offer)). The 8 p.m. timing is from 6AM City ([Columbus](https://cbustoday.6amcity.com/food/go-to-dinner-with-strangers-in-columbus-with-timeleft)), not from Timeleft itself.
6. **Follow-up [V; launch date V-corrected].**
   - "Timeleft Repeat is a new feature that lets you reconnect with people you've already met at Timeleft dinners. When booking your next dinner, you can invite past connections to join your table." ([Timeleft Repeat post](https://timeleft.com/post/timeleft-repeat-reconnect-with-friends/))
   - **Date caveat:** the post shows December 15, 2025, but Timeleft's Leeds and Liverpool launch posts also show December 15, 2025 while their URLs are dated 2024/01/22. That date is probably a site migration, not the launch. A help article for Repeat exists with an ID in the 2024 range ([Timeleft help: Repeat](https://help.timeleft.com/hc/en-150/articles/21656360309276-Timeleft-Repeat)). Treat Repeat as "live since 2024 or 2025", not "shipped Dec 2025".
   - Repeat mechanics [V] (help article): pick a date, tick eligible past connections in your current city, invitees get an email, and you see on the group list who accepted. An invite can fail if the invitee has a different city set, is already booked, or the table is full. If an invitee is flagged as a bad match with someone at the table, they can choose whether to join.
   - **Timeleft Connect [V]:** "There's no need to 'match' anymore; all participants are automatically connected and can chat with each other after the event." A short feedback round lets you leave "positive impressions" of others, which appear on their profile and trigger a notification ([Timeleft help: Connect](https://help.timeleft.com/hc/en-150/articles/14101705679260-What-is-Timeleft-Connect)). Note for Switchboard: Timeleft moved *away* from mutual matching to automatic connection.
   - "Bring a +1": "Users can now attend their first Timeleft dinner with someone they already know. Bring a +1 is live now for all upcoming dinners." ([Timeleft feature post](https://timeleft.com/post/1feature/))
7. **Repeat attendance.**
   - The weekly cadence plus a monthly subscription. The nexspark review notes "the table resets every week."
8. **Format sprawl [V-corrected].** The help center lists six event types: dinners, coffees, drinks, runs, women-only events, and LGBTQ+ events. Not every type runs in every city ([Timeleft help: event types](https://help.timeleft.com/hc/en-150/articles/28532667896988-What-types-of-events-does-Timeleft-offer)).
   - Coffee is a daytime, non-alcoholic format, often on Saturday afternoons ([Timeleft help: Coffee](https://help.timeleft.com/hc/en-150/articles/25035113582236-What-is-Timeleft-Coffee)).
   - "Standalone Drinks on Thursdays" is a subscriber-only format ([Timeleft help](https://help.timeleft.com/hc/en-150/articles/20303660945308--Standalone-Drinks-on-Thursdays)).
   - Women-only events exist "in selected cities"; the "on Tuesdays" detail from the earlier aggregator listing ([apppricinglab](https://apppricinglab.com/app/apple/6466442949)) is [K] (unconfirmed after recheck).
9. **Special events [V].** Example: "Timeleft x Puro | Special Dinner | 250 strangers, 5 cities, 1 evening" on Luma. ([luma.com/bm6s5f8t](https://luma.com/bm6s5f8t))

### Matching algorithm (stated) [V]

From "Timeleft Algorithm: The Maestro of Your Dinners" ([timeleft.com](https://timeleft.com/post/timeleft-algorithm-the-maestro-of-your-dinners/)):

- "A balanced mix of men and women. Note that Timeleft is favored by women, who often make up over 60% of participants (thus 4 per table)."
- "An age gap of five to seven years for common life echoes." The FAQ instead says the table aims for a span under 10 years "whenever feasible".
- "A mix of introverts and extroverts for a balanced rhythm."
- Language, and "hundreds of parameters".

A CultureMap Austin piece notes the blog only describes men and women, although the app offers a nonbinary marker. ([CultureMap](https://austin.culturemap.com/news/city-life/timeleft-how-to-make-friends-austin/))

**Read:** this is a constraint-satisfaction seating problem (gender ratio, age band, temperament mix, language, budget, neighborhood). It is not deep compatibility prediction.

### Psychology mechanisms

- **Fixed weekly ritual ("every Wednesday").** Removes the choice of when and builds a habit.
- **Removal of choice.** You do not pick who or where. Choosing nothing lowers the effort of deciding and dodges the rejection signals of a profile.
- **Equalizer.** Everyone at the table is new, so nobody is the outsider.
- **The quiz as a light identity ritual.** Zodiac sign and industry act as conversation starters.
- **Drip-reveal anticipation.** Industries and signs the night before, then the venue that morning.
- **Prepayment as commitment.**
- **Safety in numbers.** Six people and a public venue.
- **The Last Drink as an escalation valve.** You can keep going without anyone having to ask.

### Design language [U]

- Not verifiable this session: the site and app could not be fetched.
- What the excerpts do show is a numbers-forward voice ("5 strangers", "250 strangers, 5 cities, 1 evening") and an Instagram-first brand. The podcast page cites 1.2M Instagram followers. ([Acast](https://shows.acast.com/now-we-build/episodes/6a1f20269942b8f91f30d7a3))
- Check the live site for colors, type, and screens.

### Voice and copy (verbatim where sourced)

- "Turn Strangers into Friends" (site title, [timeleft.com](https://timeleft.com/)) [V] (first pass; the recheck could not resurface the homepage)
- App Store name: "Timeleft: Make New Friends IRL" [V] ([App Store](https://apps.apple.com/app/id6466442949))
- "Wednesday has been our core dinner night since launch" (help center) [V]
- "There's no need to 'match' anymore; all participants are automatically connected" (help center, Timeleft Connect) [V]
- "Bring a +1 is live now for all upcoming dinners." [V]
- "A mix of introverts and extroverts for a balanced rhythm." [V]
- "An age gap of five to seven years for common life echoes." [V]
- "250 strangers, 5 cities, 1 evening" [V]
- "Dinner with Strangers: The New Social Revolution Hits Paris" (blog headline) [V]
- "Timeleft Touches Down in Toulouse: Sociable Suppers in the Pink City" (city-launch post headline) [V] ([link](https://timeleft.com/post/timeleft-touches-down-in-toulouse-sociable-suppers-in-the-pink-city/))
- "Seaside secrets unveiled: Timeleft's dinners with strangers hits Brighton" [V]
- Positioning repeated in coverage: marketed as friend meetups "NOT for dating" (Reddit, sponsored guides) [V]. Earlier French coverage described "meet singles in Lyon" dinners, so the line has wobbled. ([Le Bonbon](https://en.lebonbon.fr/lyon/society/timeleft-meet-singles-in-lyon-through-dinner-parties-with-strangers))
- Push notifications: still none captured verbatim [U] (unconfirmed after recheck). The notification touchpoints are documented, though [V]: an email 24 hours before ("check the app for your assigned restaurant information"), a morning-of venue reveal, the table number one hour before, a Last Drinks prompt after dinner, and a notification when someone leaves you a "positive impression". Sources in the core-loop section above.

### Marketing and growth

- **City-launch threshold [V, single secondary source].** "The app would only launch in a city once 151 people had signed up." This creates scarcity and guarantees table density on day one. ([StartupSpells](https://startupspells.com/p/how-timeleft-solved-the-chicken-and-egg-problem)) Two targeted rechecks found no Timeleft or press source repeating the 151 figure (unconfirmed after recheck). Cite it as "reported by StartupSpells", not as Timeleft policy. Timeleft's help center only says to check the active-city list on timeleft.com ([Timeleft help: Is Timeleft in my city](https://help.timeleft.com/hc/en-150/articles/27949447374748-Is-Timeleft-Available-in-My-City)).
- **Salt Lake City [checked, not found].** Three searches (Timeleft + Salt Lake City / Utah) found no SLC listing, launch post, or 6AM City placement. Nearest confirmed Western markets: Denver, Phoenix ([azfamily, Jan 2025](https://www.azfamily.com/2025/01/30/want-meet-new-people-app-organizes-dinners-with-strangers-phoenix-area)), Seattle. This is absence of evidence, not proof Timeleft is absent; check the app with an SLC location.
- **Charge from day one [V].** There was no free tier, which kept CAC payback visible. (Same source.)
- **Blitz, then prune [V/C].** "Expanded to 320+ cities in one year, that's one per day on average." In 2025 it "scaled down to 200+ cities". ([Tim Frin Substack](https://timfrin.substack.com/p/inside-timelefts-journey-to-connecting)) Timeleft's own company copy now reads: every Wednesday it hosts "over 15,000 strangers in 2000+ restaurants across 275 cities in 62 countries" ([Cake company profile](https://www.cake.me/companies/timeleft?locale=ja)), while another Timeleft page says "over 200 cities across 52 countries" ([Timeleft blog](https://timeleft.com/blog/dinner-with-strangers/)). The biweekly-dinner test in some cities (see core loop) is further evidence of density pruning.
- **Earned media at scale [V].** The founders claim "400 articles presse et TV" and close to 1M Instagram followers. They also say paid ads alone were not enough: "Avec le budget ADS, on ne gagnait pas assez pour couvrir les dépenses de la société." ([DailyMax](https://dailymax.substack.com/p/timeleft-de-0-a-1-million-deuros))
- **Local-newsletter sponsorship [V].**
  - Paid placements in 6AM City newsletters ran in Boston, Dallas, Indianapolis, San Antonio, and Seattle.
  - All used the same templated headline, "Go to dinner with strangers in [City] with Timeleft."
  - This is a cheap, hyperlocal, trusted channel, and an SLC analog exists.
- **City launch posts as SEO and press bait [V].** Each city gets a blog post with a local pun (Toulouse "Pink City", Brighton "Seaside secrets").
- **Restaurant supply side [V].** The company guarantees partner restaurants "two tables of six or more every month", so it brings them filled tables on a slow weeknight. ([Brussels Times](https://www.brusselstimes.com/belgium/1160308/table-for-six-strangers-fighting-urban-loneliness-over-dinner/), via search summary)
- **Referral.** Bring a +1 converts the "I'm scared to go alone" objection into a referral [V]. I did not find a formal referral-credit scheme [U].

### Business model and pricing [C]

- **Official position [V]:** Timeleft "updated its pricing in cities and countries worldwide" and the only way to see your local rate is to pick a dinner date in the app. Plans are 1-, 3-, 6- and 12-month (12-month "limited availability"); the subscription is time-based, not event-based, and never includes food or drink ([Timeleft help: pricing](https://help.timeleft.com/hc/en-150/articles/17768194556828-Why-Has-Timeleft-Updated-Its-Pricing), [plans](https://help.timeleft.com/hc/en-150/articles/25484953946140-What-Subscription-Plans-Does-Timeleft-Offer)). Do not cite a single US price as "the" price.
- **App Store in-app purchases [V, tracker]:** three options at $19.99, $46.99 and $62.99 (App Pricing Lab snapshot, June 22, 2026); the tracker does not say which plan each is ([apppricinglab IAP](https://apppricinglab.com/iap/apple/6466442949)).
- **US:**
  - $19.99/month subscription, which "unlocks your first booking". ([Timeleft blog](https://timeleft.com/blog/how-does-timeleft-work/))
  - In 2024: $16 for a single dinner and $26 for a one-month pass. ([Axios](https://www.axios.com/local/washington-dc/2024/08/18/timeleft-app-dinner-friends-dc)) Seattle: $16 per booking ([6AM City Seattle](https://seatoday.6amcity.com/food/go-to-dinner-with-strangers-in-seattle-with-timeleft)) [V].
  - A 2026 review gives $20 to $26/month or $20 to $35 per ticket. ([nexspark](https://nexspark.org/journal/timeleft-review))
- **Other markets:** €12.99 per ticket, with monthly plans also offered. The food bill is always separate and paid by each diner.

### Metrics [V, mostly self-reported]

- **Funding [V, aggregator only]:** $7M Series A on July 19, 2024. Investors listed include Kima Ventures, FJ Labs, Play Ventures, and Redstone. ([CB Insights](https://www.cbinsights.com/company/timeleft/financials), [Signalbase](https://www.trysignalbase.com/news/funding/timeleft-raises-70m-series-a-funding)) Recheck: no press release or news article for the round was found, and no later (2025 or 2026) round surfaced. Cite as "about $7M, per CB Insights".
- **Revenue:**
  - "3 ans et 4 pivots" to the first euro, then "7 mois supplémentaires pour atteindre 1M€ de MRR".
  - €1.2M revenue in November (likely 2024), "+48x en 1 an". ([DailyMax](https://dailymax.substack.com/p/timeleft-de-0-a-1-million-deuros))
  - €18M ARR and 150,000 monthly participants in August 2025, with roughly 100 staff. Signalbase says 125. ([Tim Frin](https://timfrin.substack.com/p/inside-timelefts-journey-to-connecting)) (A targeted recheck found no other source for the ARR figure; unconfirmed after recheck.)
  - Timeleft's own copy: "over 15,000 strangers" every Wednesday, which at four Wednesdays is roughly 60,000 seats a month, well under 150,000. The 150,000 figure may include non-dinner formats. [C]
- **Scale:**
  - An undated podcast page claims "160+ cities across 45+ countries", "3 million users", and 150,000 per month. ([Acast](https://shows.acast.com/now-we-build/episodes/6a1f20269942b8f91f30d7a3))
  - In Paris, "more than 700 people convene on Wednesdays in roughly 80 different restaurants."
  - [C] City counts range from 120 to 320 depending on date.
- **Tech [V]:** "For its first 16 months, Timeleft ran entirely on Bubble and FlutterFlow, reaching €1M in monthly revenue without a traditional codebase." Migrating off that stack then took 8 months.
- **Retention:** no published figure. I searched specifically and found none.

### Complaints and failure modes [V]

- **Thin tables and no-shows:**
  - "If I knew it was only 3 of us, I would have canceled (plus - they promise 6)." ([Trustpilot](https://uk.trustpilot.com/review/timeleft.com?page=6))
  - A Reddit r/datingoverforty user said "the rest were no shows at their table."
- **Overbooking and the age band:** "Timeleft have overbooked my table at the restaurant and i was seated to another with age mismatch." The same reviewer complained they were "answered by an AI robot."
- **Chemistry is not guaranteed:** "14 dinners and none were amazing! Vibe didn't flow, people didn't connect." ([Trustpilot](https://ie.trustpilot.com/review/timeleft.com?page=10))
- **Billing and refunds:**
  - Double charges, refunds missing after 10 to 19 days, and subscriptions that kept renewing until the card issuer was called.
  - Support is a form only. ([Sikayetvar](https://www.sikayetvar.com/en/timeleft-us/timeleft-failed-meetup-and-double-charge-with-no-support), [Google Play via onclarity](https://www.onclarity.com/leaderboard/insight/timeleft))
- **The quiz feels superficial,** and diners keep meeting the same regulars in small cities. ([Wherever I Look, Oct 2024](https://wherever-i-look.com/articles/experiences/timeleft-the-strangers-meeting-for-dinner-app-review))
- **Late venue reveal** is a logistics and accessibility problem.
- **Counterweight:** the Google Play rating is about 4.4 from roughly 7,900 reviews. A Vietnam user found "a close-knit crew" after five dinners. ([Vietcetera](https://vietcetera.com/en/4-apps-to-make-friends-in-vietnam-and-what-the-locals-say-about-them))

---

## 2. 222 (LA origin, now NYC/SF/London/Amsterdam; "find your people")

### Company facts [V/C]

- **Founders:** Keyan Kazemian, Danial Hashemi, Arman Roshannai.
- **Origin:**
  - A university-funded research project on predicting whether strangers would enjoy time together.
  - Then algorithm-matched backyard dinners in Orange County.
  - Then restaurants and bars in LA from early 2022. ([TechCrunch 2022 via Yahoo](https://finance.yahoo.com/news/222-wants-match-perfect-strangers-140055716.html), [CB Insights](https://www.cbinsights.com/company/222))
- **Founded [C]:** 2020 or late 2021. Seedtable says 2021 ([Seedtable](https://seedtable.com/companies/222/funding-rounds/series-a-2025-12)).
- **HQ [C]:** variously LA, New York, or Sacramento.
- **Funding [V/C]:**
  - $10.1M Series A in December 2025 is confirmed; CB Insights dates it December 23, 2025. ([Techleap](https://finder.techleap.nl/news/feed/ai-powered-offline-meetup-platform-222-raises-10-1m-series-a), [SV Post](https://svpost.com/articles/222-10m-series-a/), [Dealroom](https://app.dealroom.co/news/feed/222-raises-10m-to-use-ai-for-irl-meet-cutes-and-maintaining-relationships), [CB Insights](https://www.cbinsights.com/company/222/financials))
  - **Lead investor [C]:** SV Post credits Upfront Ventures as lead; Seedtable lists Upfront only as a participant; CB Insights names Y Combinator among the investors. Say "a round including Upfront Ventures", not "led by Mark Suster", until a primary source settles it.
  - **Total [C]:** $13.7M (earlier memo source) versus about $12.05M over six rounds (CB Insights).
  - The Dealroom headline frames the round around "AI for IRL meet-cutes and maintaining relationships." The retention and maintenance angle is notable.
- **Cities [V-corrected]:** "From London to Los Angeles" (AFP, Sept 2025). A Forbes Argentina piece says 222 reaches "thousands of users each week across 17 markets, with New York the largest" ([Forbes Argentina](https://www.forbesargentina.com/innovacion/chau-tinder-jovenes-stanford-berkeley-crearon-una-nueva-forma-conseguir-pareja-ya-recaudaron-millones-n93746), via search snippet). The Boston Globe (Aug 2026) reports a Boston launch in 2025 ([Boston Globe](https://www.bostonglobe.com/2026/08/28/lifestyle/ai-friendship-apps-gen-z/)). Head of Operations job posts exist for Washington, DC and Toronto ([General Catalyst job board](https://jobs.generalcatalyst.com/companies/222/jobs/53294965-head-of-operations-washington-dc)).
- **Salt Lake City [checked, not found].** No evidence 222 operates or is hiring in SLC (search returned only unrelated "222" addresses). Unconfirmed either way.

### Core loop

1. **Questionnaire [V/C].**
   - "About 30-some questions." Answers sort users into one of 16 personality categories, with items like birth order and spontaneity. ([Yahoo/TechCrunch 2022](https://www.yahoo.com/now/222-wants-match-perfect-strangers-140055716.html))
   - Later coverage calls it a "lengthy questionnaire on values and interests." ([AFP via eNCA](https://www.enca.com/lifestyle/ai-powered-meet-apps-fight-loneliness))
   - A Lazyweb teardown lists 14 screens in the questionnaire flow. ([Lazyweb](https://lazyweb.com/flow/222/complete-questionnaire))
2. **Intent split [V].** Users are "split roughly evenly between those seeking new friends and those open to romance." 222 deliberately straddles friendship and dating. ([GDI](https://www.globaldatinginsights.com/featured/222-aims-to-recreates-the-meet-cute-internationally))
3. **Invitation to a curated experience [V].**
   - Formats include dinners, comedy shows, and nights out at partner venues.
   - Group size is six, "usually three men and three women" [V] (Forbes Argentina, above). The brief's "you'll meet 3 people" framing is wrong [V-corrected]. The App Store listing says "each member is vetted before being selected for an experience" and every experience is public and in a group ([App Store](https://apps.apple.com/us/app/222/id6450612690), via search snippet). TechCrunch (2022) said identity is verified mainly through payment information, with venue staff on hand ([TechCrunch 2022](https://techcrunch.com/2022/11/14/2440702/)).
   - Before the event, a text gives "a few facts about the other attendees" [V] ([BI](https://businessinsider.nl/a-friendship-app-connected-me-with-five-strangers-we-actually-hit-it-off/)).
   - The founding stance: "No Swiping, No Profiles, No DMs." ([dot.la](https://dot.la/222-anti-metaverse-app-2658453941.html))
   - Profiles carry no photos. ([Friend Seekers Anonymous podcast](https://shows.acast.com/friend-seekers-anonymous/episodes/two-peas-in-a-podcast))
4. **The night.** A small group at a partner venue. Business Insider found attendees "friendly and eager to meet someone new" because they had paid and opted in. ([BI](https://businessinsider.nl/a-friendship-app-connected-me-with-five-strangers-we-actually-hit-it-off/))
5. **Post-event feedback is the core asset [V].**
   - The app "asked for feedback on her matches, and encouraged a second meetup with one of them." ([The Hustle](https://thehustle.co/news/were-still-lonely-startups-are-still-trying))
   - It "follows up to gauge interest, and helps coordinate follow-up hangouts or dates, including making reservations." ([GDI](https://www.globaldatinginsights.com/featured/222-aims-to-recreates-the-meet-cute-internationally))
   - The AI is "trained on proprietary user feedback data." It "becomes particularly effective at matching users after they participate in several events" (AFP).
   - The model is a learning loop: each night is labelled training data. ([letsdatascience](https://letsdatascience.com/news/222-uses-ai-to-simulate-meet-cute-ddb8da1e))
6. **Repeat.** A membership with recurring invites. Members "go many times, form group chats." ([SF Gazetteer](https://sf.gazetteer.co/pay-to-play))
7. **Double-opt-in reconnection [U, partly V].** Fast Company Brasil reports that after each event participants say who they would like to stay in touch with or meet again, and that this feedback trains the matcher [V] ([Fast Company Brasil](https://fastcompanybrasil.com/tech/startup-quer-programar-o-acaso-com-ia-e-reviver-encontros-inesperados/)). Gazetteer SF says there is intentionally no in-app messaging, but members can invite one another to events after meeting [V] ([SF Gazetteer](https://sf.gazetteer.co/pay-to-play)). Whether a pick is revealed only when mutual is still unconfirmed after recheck.

### Psychology mechanisms

- **Angel-number branding.** 2:22 and $2.22, then $22, then $22.22, plays as serendipity and fate.
- **The meet-cute fantasy.** Romance is possible but never stated as the goal.
- **No profiles, no photos.** This removes appearance-based pre-filtering and the anxiety of judging people.
- **Curation as status.** You are "sent" somewhere good.
- **A strict no-show policy as a commitment device [V, rechecked].** BI: the policy "involves added fees" and removes people "who don't cancel with notice" ([BI](https://businessinsider.nl/a-friendship-app-connected-me-with-five-strangers-we-actually-hit-it-off/)). No fee amount or official policy page was found.
- **The AI-learns-you narrative.** It gives a reason to keep attending: "it gets better after a few."

### Design language [U]

- Not verifiable this session. The App Store listing name is "222 - find your people."
- I recall a ticket and invitation aesthetic built around the numeral, but could not confirm it.

### Voice and copy [V unless noted]

- "222 - find your people." (App Store name, [apps.apple.com](https://apps.apple.com/us/app/222-find-your-people/id6450612690)) [V-corrected: may be outdated]. The current listing indexes at [apps.apple.com/us/app/222/id6450612690](https://apps.apple.com/us/app/222/id6450612690) under the name "222". It describes "invites to social experiences happening nearby", "no profiles, no DMs, no scrolling, no swiping", and explicitly says 222 is not a dating app, not a friend-making service and not a networking tool. Rating 4.7 from about 4.4K ratings (search snippet, Oct 2026). Note the tension with "find your people" and with the 50/50 friends-or-romance split.
- "Finds you the people you'll get along with and sends you to the places you'll love." (App Store description; first pass, not resurfaced in recheck)
- Careers copy: "on a mission to maximize the probability of an in real life (IRL) future"; calls itself "a relationships company"; job posts repeat "building the future of social" [V] ([careers page, apparently 222's](https://serendipityproject.notion.site/mle), [General Catalyst jobs](https://jobs.generalcatalyst.com/companies/222/jobs/53294966-head-of-operations-toronto)).
- Push copy: none captured verbatim (unconfirmed after recheck).
- "No Swiping, No Profiles, No DMs" (dot.la headline, founder framing)
- "Recreate the meet-cute" (GDI framing)
- "AI for IRL meet-cutes and maintaining relationships" (Dealroom headline)

### Pricing [C]

- $2.22 per weekly dinner in early LA days (2022).
- A $17 "curation fee" per event, or a $22/month subscription that waives the fees. ([SF Gazetteer](https://sf.gazetteer.co/pay-to-play), [Extruct](https://www.extruct.ai/hub/222-place-funding))
- "A $22.22 curation fee or a monthly subscription for the same price." TechCrunch also cites membership of "$70 in New York and €55 in Amsterdam." ([TechCrunch Apr 2026](https://techcrunch.com/2026/04/05/as-people-look-for-ways-to-make-new-friends-here-are-the-apps-promising-to-help/)) The $70 and €55 figures did not resurface in recheck (unconfirmed after recheck).
- $22.22 a month is now confirmed by two 2026 sources: the Boston Globe (Aug 2026) and Forbes Argentina, which says it buys "unlimited access to events" and that 222 also charges the bars, restaurants and organizers it partners with [V] (links in Company facts above).
- Pricing evidently varies by city and has risen over time.

### Complaints [thin]

- No Reddit threads surfaced. The main friction found is the punitive no-show policy and a price that has climbed.
- Trustpilot has only two reviews (spring 2026), both alleging paid access followed by rejection or waitlisting and a later refund, and "an undisclosed first time curation fee" [V, n=2] ([Trustpilot](https://ca.trustpilot.com/review/222.place)). This shows curation-as-status turning into the feeling of being "rejected" by the product.
- Matching quality is admitted to be weak for newcomers ("better after several events").

---

## 3. Pie (Andy Dunn; event feed plus groups of six)

- **People and funding [V]:**
  - Founded by Andy Dunn, the Bonobos co-founder.
  - $11.5M Series A led by Forerunner Ventures, reported September 24, 2024. Total raised is $24M per Fitt Insider. ([Fitt Insider](https://insider.fitt.co/pie-raises-11-5m-for-irl-friendships/)) Rechecked [V]: participants Ev Williams, Origin Ventures, Renegade Partners and Precursor Ventures; 20,000 MAU at the time of the round ([Pulse 2.0](https://pulse2.com/pie-social-app-company-raises-11-5-million-series-a/), [Wilson Sonsini](https://www.wsgr.com/print/v2/content/49032737/Wilson-Sonsini-Advises-Pie-on-$11.5-Million-Series-A.pdf)). The Aug 2026 TechCrunch piece also names Lightspeed and Accel as backers, which may indicate a later, unannounced round [?].
  - "Hanna Eldridge" could not be linked to Pie [U]. New people found: Nadya Okamoto (founder of NYC run club Zoomies) joined as co-founder and CMO in 2026 [V] ([MediaPost](https://www.mediapost.com/publications/article/416426/can-pie-cure-loneliness-new-cmo-believes-it-can.html)).
- **Scale [V, company-sourced]:** over 130,000 MAU (TechCrunch, Mar 2025), then "around 300,000 users" (TechCrunch, Aug 2026). Pie says average time in app rose from two to ten minutes after a December product change.
- **Cities [V-corrected]:**
  - San Francisco launch in November 2024. ([TechCrunch](https://techcrunch.com/2024/11/19/irl-social-app-pie-is-coming-to-sf-to-make-you-less-lonely))
  - As of April 2026, only Austin, Chicago, and San Francisco. ([TechCrunch Apr 2026](https://techcrunch.com/2026/04/05/as-people-look-for-ways-to-make-new-friends-here-are-the-apps-promising-to-help/))
  - By August 2026 users are reported in Chicago and Austin first, then Los Angeles and New York (MediaPost); a Spanish-language report says Chicago, New York and Los Angeles ([Ecosistema Startup](https://ecosistemastartup.com/pie-de-andy-dunn-pivota-hacia-comunidades-irl/)). So the "three cities" claim is out of date. No Boston, Seattle or SLC evidence.
- **August 2026 pivot to communities [V]:** Pie launched "Community Homes", permanent pages for social groups with a feed, membership controls and organizer planning tools, positioned against group texts and Facebook Groups. Dunn calls Pie a "Reddit for IRL"; the aim is for events to follow from connections rather than be the main draw ([TechCrunch](https://techcrunch.com/?p=3156057), [Startup Researcher](https://www.startupresearcher.com/news/pie-launches-new-community-homes-for-real-world-groups)). This is the same "the event is acquisition, the ongoing group is the product" move as Timeleft Repeat and Bumble's Geneva rebuild.
- **Core loop [V]:**
  - Pie "incentivizes creators to host events, rather than simply listing them." The Series A was used to pay organizers.
  - In 2024 it shifted to a feed of local events such as running groups and mahjong clubs.
  - Attendees take "a brief personality assessment, and the algorithm sorts them into groups of six with a group chat before the event."
  - In March 2025 it added AI-assisted matching, using quiz technology from the acquired Sparked Connections, and pays local hosts. ([TechCrunch Mar 2025](https://techcrunch.com/2025/03/04/andy-dunns-new-app-pie-uses-ai-to-help-you-make-friends)) [V]
- **Mechanism worth stealing:** a "pod inside a crowd."
  - You attend a public event such as a run club or mahjong night, but arrive pre-assigned to a group of six with a pre-event chat.
  - That turns a large event, the hardest place to meet anyone, into a small one, and solves the "who do I talk to" moment.
- **Supply-side trick:** paying hosts makes hosts the growth channel. Their own audiences come with them.
- **Pricing, design, retention:** not found [U].

---

## 4. Bumble For Friends (the BFF relaunch, September 2025)

- **What changed [V]:**
  - In September 2025 (reported Sept 17 to 18) Bumble relaunched BFF as a standalone app rebuilt on Geneva, the group-chat and community app it acquired.
  - **Acquisition [V-corrected, conflict resolved]:** announced May 2024, closed July 1, 2024, for "approximately $17.0 million in cash" per Bumble's Q2 2024 10-Q; a later 10-Q gives $17.5M net of cash acquired. Geneva was pre-revenue and booked as an asset acquisition ([Bumble 10-Q](https://www.sec.gov/Archives/edgar/data/1830043/000095017024093910/bmbl-20240630.htm)). Geneva had raised about $36M from Coatue and others before the sale.
  - The Geneva app shut down, and its users migrated with their groups and messages intact.
  - BFF mode inside the dating app stopped working. The standalone Bumble For Friends app is "no longer available in the U.S." but remains available elsewhere, per a Bumble spokesperson [V-corrected] ([Fast Company SA](https://fastcompany.co.za/fast-company/business/2025-09-19-bumbles-new-bff-app-aims-to-spark-the-great-friennassance)). ([TechCrunch Sep 2025](https://techcrunch.com/2025/09/18/bumble-bffs-revamped-app-is-here-focusing-on-friend-groups-and-community-building), [Bumble support](https://support.bumble.com/hc/en-us/articles/30781191036317-Changes-to-Bumble-For-Friends-and-Bumble-BFF-Mode), [GDI](https://www.globaldatinginsights.com/featured/bumble-bets-big-on-friendships-with-revamped-bff-app/))
- **Loop [V]:**
  - 1:1 friend matching plus a new Groups tab with chat rooms, hangout planning, and an in-app event calendar.
  - Groups range "from small groups to thousands of members."
  - Group discovery was deferred to February 2026. [C] One source says it launched then; others only say it was slated. Unconfirmed after recheck.
  - **Group meet-ups:** members "invite at least two connections to a planned activity," either chosen from Bumble's suggestions or written themselves. Accepted invitees join a group chat.
- **Strategy quote [V]:** CEO Whitney Wolfe Herd called friendship "one of our most exciting long-term growth opportunities" on the Q2 2025 earnings call.
- **International rollout [V/C]:** an Argentina launch was reported July 2026. ([iProfesional](https://www.iprofesional.com/tecnologia/389346-bumble-lanza-nueva-funcion-en-la-argentina-para-buscar-amigos))
- **Competitors named in the coverage [V]:** Clockout, Clyx, Les Amis, Timeleft, 222.
- **Relevance to Switchboard:**
  - The "invite at least two connections" rule is a minimum-group-size safety and pressure valve. Nobody is alone with one person.
  - It is the closest big-company analog to Switchboard's plan-from-friends model. The difference is that it starts from swiped strangers.
- **Known failure mode [U, historic BFF reviews]:** matches that never convert from chat to a meetup ("pen-pal purgatory"), and women-heavy supply. This is the reason they pivoted to groups.

---

## 5. Meet5 (Frankfurt; group meetups for 40+)

- **Facts [V]:**
  - Formerly Go Crush GmbH, a 2017 dating platform that pivoted to group meetups.
  - €8M Series A in September 2025 led by Peak. About €1.1M had been raised before that.
  - The money is to double the team from 40 to 80 and expand into Benelux, France, and the US.
  - The company claims over 2.5M registered members and more than 40,000 community-organized group meetings per month. The App Store listing cites more than 550,000 meetings held.
  - Rechecked [V]: Series A led by Dutch VC Peak, September 2025; also "around 300,000 monthly participants" across hiking trips, dinners and cultural events ([Tech Funding News](https://techfundingnews.com/meet5-europes-largest-social-app-for-over-40s-grabs-e8m-to-fuel-global-expansion/), [Trending Topics](https://www.trendingtopics.eu/meet5-socializing-app-fuer-menschen-ab-40-sichert-sich-8-millionen-euro/)).
  - Sources: [Startbase](https://www.startbase.com/news/meet5-mit-8-millionen-euro-series-a/), [starting-up.de](https://www.starting-up.de/news/news-investments/meet5-1-mio-wachstumsfinanzierung-fuer-freizeit-app-fuer-generation-40.html), [Arab Founders](https://arabfounders.net/en/meet5-raises-8m-to-expand-social-platform/), [App Store DE](https://apps.apple.com/DE/app/id1222980795)
- **Model [V]:**
  - Meetups are free.
  - Premium starts at €5/month and unlocks private chats and "who visited your profile." (Price unconfirmed after recheck.)
  - Monetization is decoupled from attendance, the opposite of Timeleft.
- **Mechanics [U]:**
  - Member-hosted meetups ("Treffen") with small caps, about 6 people, and age-banded visibility.
  - The cap and age rules are from prior knowledge, not verified this session.
- **Lessons:**
  - It is the proof point for an underserved age band. Over-40s are lonelier and have more disposable time and money than Gen Z, yet nearly every US competitor targets 22 to 35.
  - Community-hosted meetups scale without restaurant logistics.

---

## 6. Hey! VINA (women's friend matching, 2015-era)

- **Facts [V]:**
  - Co-founded by Olivia June (Poole/Clement) and developer Jen Aprahamian.
  - Covered as "the Tinder for girlfriends": swipe-based, matching on interests, location, and mutual friends, with chat after a right swipe.
  - It launched in LA, New York, and SF. An alumni profile claims "158 countries" and "more than 100,000 users in its first 10 days."
  - Sources: [Protein](https://www.protein.xyz/hey-vina-is-a-friendship-building-app-for-women/), [Stylist](https://stylist.co.uk/life/squad-goals-new-tinder-style-friendship-app-seeks-to-revolutionise-our-social-life-connections/63350), [Sage Hill School](https://www.sagehillschool.org/news-detail?pk=1167220)
- **Current status [U, likely defunct]:** a competitor's blog post reports "Hey Vina shutting down" ([Gofrendly](https://www.gofrendly.com/?p=90084)); the post is undated, and no 2024 to 2026 coverage of the app operating was found. Describe it as "shut down" only with that caveat.
- **Lesson:**
  - It is the canonical first-generation failure: 1:1 swipe matching for friendship reproduces dating-app fatigue, without dating's motivation to push through to a meetup.
  - Every 2023 to 2026 entrant in this memo is a reaction against this model.

---

## 7. Newer entrants and leads (lighter coverage)

| Name | What I could establish | Confidence |
|---|---|---|
| **Clyx, Les Amis, Clockout** | Named as friendship-first rivals in 2025 Bumble coverage ([GDI](https://www.globaldatinginsights.com/featured/bumble-bets-big-on-friendships-with-revamped-bff-app/)); CB Insights has a Clyx profile | Names [V], mechanics [U] |
| **Known** | Gen Z dating app "rebuilding dating around the actual date," paired with 222 in 2026 coverage ([Runtime Wire](https://runtimewire.com/article/known-222-gen-z-dating-apps-without-swipes), [Forbes Jul 2026](https://www.forbes.com/sites/sofiachierchio/2026/07/11/these-gen-z-founders-are-reinventing-dating-apps-without-the-swipe/)) | [V] existence, details [U] |
| **Timeleft runs/coffee/drinks** | Timeleft itself moving into the run-club and coffee formats | [V] |
| **Pie run clubs** | Pie's feed is built around running groups and mahjong clubs | [V] |
| **Geneva** | Absorbed into Bumble For Friends; app shut down | [V] |
| **IRL (the app)** | Raised a $170M Series C (SoftBank Vision Fund 2, $1.17B valuation; about $200M total). Shut down June 2023 after a board investigation found 95% of its reported 20M users were "automated or from bots". Founder Abraham Shafi was later charged with fraud ([TechCrunch 2023](https://techcrunch.com/2023/06/26/irl-shut-down-fake-users/), [TechCrunch 2024](https://techcrunch.com/2024/07/31/founder-behind-social-media-app-irl-charged-with-fraud)) | [V] |
| **Thursday** | London dating app (2021) that only worked on Thursdays. Shut the app in 2025 citing "rapidly declining interest" in dating apps and pivoted to Thursday Events, ticketed weekly in-person events. Claims about 2M lifetime users ([GDI](https://www.globaldatinginsights.com/featured/thursday-shutters-dating-app-to-shift-focus-on-real-world-events/), [City AM](https://www.cityam.com/?p=2296926)) | [V] |
| **Market size signal** | Appfigures via TechCrunch (Apr 2026): over a dozen local-focused friendship apps generated about $16M in US consumer spending "so far this year" ([TechCrunch](https://techcrunch.com/2026/04/05/as-people-look-for-ways-to-make-new-friends-here-are-the-apps-promising-to-help/)) | [V] |
| **Breeze** | Dutch dating app that books and prepays the first date for you | [U] |
| **"Tuesdays", "Kindred", "Clyde"** | Not found in any result before the search budget ran out | Open leads |

2026 press is treating the category as mainstream:

- [TechCrunch, April 2026](https://techcrunch.com/2026/04/05/as-people-look-for-ways-to-make-new-friends-here-are-the-apps-promising-to-help/)
- [Marketplace, May 2026](https://www.marketplace.org/story/2026/05/05/want-to-make-new-friends-theres-an-app-for-that)
- [KERA/NPR, July 2026, "Can an app fix the friendship recession?"](https://www.keranews.org/2026-07-25/can-an-app-fix-the-friendship-recession)
- AFP "AI-powered meet-up apps fight loneliness" (Sept 2025)

I saw these only as search results and did not read them.

---

## 8. Cross-cutting analysis

### What the category's core loop has converged on

1. A short quiz instead of a profile, and no photos.
2. The app picks the people, sometimes the venue too. The user picks only a time slot.
3. A staged reveal before the night.
4. 4 to 6 people in public, never 1:1.
5. Prepayment and no-show penalties.
6. A post-night signal (feedback, "see again", a Repeat invite) that both trains matching and seeds a second meeting.
7. A cadence or subscription to drive return visits.

### Where it breaks

- **Chemistry variance.** "14 dinners and none were amazing."
- **Density failures.** Tables of 3 and no-shows wreck a promise of 6.
- **Demographic skew.** Women are at least 60% of Timeleft diners, and the age bands leak.
- **Friendships do not carry past night one.** This is why Timeleft built Repeat and auto-connects every table after dinner (Timeleft Connect), 222 raised money on "maintaining relationships," and Pie pivoted to Community Homes in August 2026. All three have effectively conceded that the stranger dinner is acquisition, not the product.
- **Subscription and billing hostility.** Refunds and renewals are the top non-social complaint.
- **Unit economics push toward volume.** Timeleft blitzed to 320 cities, then pruned to 200.

---

## (a) Ten most transferable lessons for Switchboard

1. **The dinner is acquisition; the second meeting is the product.**
   - Timeleft Repeat (live by 2025; launch date uncertain), 222's follow-up booking, Pie's Community Homes (Aug 2026), and Bumble's pivot to groups all show the market moving toward exactly Switchboard's ground: rooms, cascades, and plans with people you already know.
   - Switchboard should present itself as where night-two happens. A "people you met" bridge into rooms is a natural wedge.
2. **Use a launch threshold per city or neighborhood.**
   - Timeleft's "151 sign-ups before launch" made scarcity feel like a feature and guaranteed density.
   - For SLC serendipity zones and local discovery, unlock a zone or neighborhood only once enough opted-in people exist. Show a progress bar instead of an empty map.
3. **A fixed ritual beats open-ended scheduling.**
   - "Every Wednesday" removes the hardest decision.
   - Switchboard could offer an optional recurring "open night" signal, such as "free Thursday evenings." This is a gentle availability default, not a commitment.
4. **Groups of 4 to 6 in public are the safety and pressure sweet spot.**
   - Bumble's "invite at least two connections" rule and every stranger app's table size agree.
   - A cascade that fills a plan to a small group, rather than 1:1, inherits that safety-in-numbers feel.
5. **Stage the reveal.**
   - Drip details (industries and signs the night before, venue that morning, Last Drink at 8 p.m.).
   - This builds anticipation at almost zero cost. Switchboard rooms can stage plan details too, such as the date locking after a poll, but never to the point of hiding logistics people need (see trap 4).
6. **A post-event signal that both sides must agree to.**
   - 222's "see them again?" is the same primitive as Switchboard's mutual-interest matching.
   - Stranger apps lack a frictionless home for it. Switchboard can be that home, with the never-reveal-unrequited guarantee as the differentiator.
7. **Pod inside a crowd (Pie).**
   - For SLC local discovery, attaching a small pre-formed group with a chat to a public event (a run club, a farmers market, a Jazz game) solves "I'd go if I knew someone there."
8. **Let people bring a friend.**
   - Timeleft's "Bring a +1" exists because going alone is the top objection.
   - Switchboard is friends-first by design. Lean on that in copy: you never have to arrive alone.
9. **Supply-side partners want filled tables on dead nights.**
   - Timeleft guarantees restaurants two tables of six a month. That is a credible SLC venue pitch for weeknight plan suggestions.
   - Paid hosts (Pie) are another lever.
10. **Hyperlocal earned media beats paid acquisition.**
    - Timeleft's founders said paid ads did not cover costs. What worked: about 400 press pieces, an Instagram audience of about 1M, templated city-launch posts, and local-newsletter placements (6AM City has a regional footprint; an SLC equivalent is worth scouting).
    - Founders were present at the first nights. Barbier attended 60 dinners incognito.

## (b) Five traps to avoid

1. **Promising a number you cannot deliver.**
   - "5 strangers" becomes a review titled "only 3 of us."
   - Never promise headcount. Promise process ("we'll keep asking until it fills or tell you honestly it didn't"). Cascades should report their real state.
2. **Billing that feels like a trap.**
   - Auto-renew, slow refunds, and form-only support dominate Timeleft's one-star reviews.
   - If Switchboard ever charges, make cancel and refund one tap, with a human answer, and an error code on every failure (per AGENTS.md).
3. **Matching theatre.**
   - Zodiac and four-question quizzes feel superficial to users ("a little superficial"), and repeat diners see the seams.
   - Do not claim algorithmic magic. Switchboard's real signals (availability, mutual interest, past plans) are more honest.
4. **Hiding logistics for drama.**
   - Morning-of venue reveals make it "impossible to get there" for some people and are an accessibility failure.
   - Anticipation should never cost someone the ability to plan transit, childcare, dietary needs, or safety.
5. **Volume-first expansion and fake density.**
   - Timeleft blitzed to 320+ cities and pruned to 200. IRL [V] collapsed after 95% of its claimed users proved to be bots.
   - An empty zone or a ghost table destroys trust faster than a waitlist. Stay deep in SLC before going wide.

## (c) Mechanics that conflict with Switchboard's consent-first, low-pressure, friends-first design

| Mechanic | Who uses it | Why it conflicts | Compatible alternative |
|---|---|---|---|
| Algorithm picks your companions with no veto | Timeleft, 222, Pie | Removes consent over who you spend an evening with | Suggest, never assign. Every invite is a cascade the host chose, and the recipient can decline silently |
| No-show fees and expulsion | 222 | Coercive commitment device. Punishes people for whom life (illness, anxiety, caregiving) intervened | Soft commitment: easy early bow-out that triggers the next cascade wave, so dropping out never strands the group |
| Prepay or subscribe to attend | Timeleft, 222 | Money as pressure turns "maybe" into a sunk cost. Billing complaints dominate reviews | Free core loop. Monetize elsewhere (Meet5 shows free meetups plus a light premium works) |
| Hidden venue until the morning of | Timeleft | Withholds information people need to consent safely | Reveal logistics early. Stage the fun bits, not the safety-relevant ones |
| Age and gender quotas computed silently | Timeleft | Opaque sorting on protected traits; binary-only gender framing | Let people set their own preferences visibly, or do not sort on these at all |
| Romance ambiguity ("meet-cute", 50% open to romance) | 222 | Muddies intent; can make friend plans feel like dates | Keep intent explicit. Mutual-interest matching stays private and two-sided, never inferred from attendance |
| Shared "Last Drink" with every table in the area | Timeleft | Escalates group size without consent, and attendees cannot tell who belongs | Opt-in "extend the night" inside the room, visible only to people already in the plan |
| Feedback ratings that train the matcher | 222 | People are graded after a social night; data use is opaque | Only private, mutual, never-revealed-if-unrequited signals, used solely to offer a reconnection both sides already want |
| Stranger-first acquisition | All | Switchboard is friends-first; strangers are an occasional layer, not the core | Serendipity zones and local discovery as opt-in edges. Friends-of-friends via cascades is the warmer default |

---

## Verification gaps to close in a follow-up session

1. Live UI and design for Timeleft and 222 (screens, palette, push copy). Needs App Store screenshots or a device.
2. 222's exact post-event mechanic: is "see again" double-opt-in, and is unrequited interest hidden?
3. Pie's Seattle and Boston history, and whether "Hanna Eldridge" is a Pie person.
4. Whether "Tuesdays", "Kindred", and "Clyde" exist as stranger-group apps.
5. Whether Timeleft operates in Salt Lake City. No SLC result surfaced.
6. The current status of Hey! VINA, IRL, and Thursday.
7. Primary-source retention numbers for any player. None were found.

## Verification pass 2026-10-17

About 60 searches; page fetches (help.timeleft.com, apps.apple.com, startupfortune.com) still failed with DNS errors, so all checks rest on search-result extracts.

**Corrected [V-corrected]**
- Timeleft reveal timing: the sequence is consistent: group profile and safety tips the day before, an email 24 hours before, the venue the morning of, and the table number one hour before. The "12 hours ahead" figure is an outlier.
- Timeleft Repeat launch date: "Dec 2025" is probably a site-migration date (the 2024 Leeds and Liverpool posts carry the same Dec 15, 2025 stamp). Lessons and analysis now say "live by 2025".
- Timeleft formats: the official list is dinners, coffees, drinks, runs, women-only and LGBTQ+, plus subscriber-only Thursday drinks. "Women-only on Tuesdays" is unconfirmed.
- 222 group size: six, "usually three men and three women", not "meet 3 people".
- 222 App Store name: the listing now indexes as "222" and disclaims being a dating, friend-making or networking app. "find your people" may be stale.
- 222 cities: 17 markets with New York largest (Forbes Argentina), Boston since 2025, ops hiring in DC and Toronto.
- Pie cities and strategy: it is no longer three cities (LA and NY now named). There are about 300K users, an Aug 2026 pivot to Community Homes, and Nadya Okamoto as co-founder and CMO.
- Bumble/Geneva: the conflict is resolved: announced May 2024, closed July 1, 2024, about $17.0M cash (10-Q). The standalone Bumble For Friends app is gone in the US only.

**Newly verified [V]**
- Timeleft: the biweekly-Wednesday test in some cities; company copy of 15,000 strangers / 2000+ restaurants / 275 cities / 62 countries every Wednesday; pricing varies by city (1/3/6/12-month plans); App Store IAPs $19.99 to $62.99; Live Activity countdowns; Timeleft Connect auto-connects whole tables after dinner with "positive impressions" feedback.
- 222: Series A $10.1M dated Dec 23, 2025; $22.22/month (Boston Globe, Forbes Argentina); BI no-show policy rechecked; post-event "who would you meet again" feedback (Fast Company Brasil); Trustpilot curation-fee and rejection complaints (n=2); careers copy.
- Pie: Series A participants and 20K MAU at raise; Sparked Connections acquisition.
- Meet5: about 300K monthly participants; Peak lead.
- IRL and Thursday: both moved from [U] to [V] with sources.
- Appfigures: about $16M US consumer spend on local friendship apps (TechCrunch Apr 2026).

**Downgraded or flagged**
- Timeleft "151 sign-ups" launch threshold: single secondary source (StartupSpells); no primary found.
- Timeleft $7M Series A: aggregator-only (CB Insights); no press release; no later round found.
- Timeleft €18M ARR: single source.
- 222 lead investor: conflicting (Upfront lead per SV Post vs participant per Seedtable; YC per CB Insights). Total funding is $12.05M or $13.7M.
- 222 "$70 NYC / €55 Amsterdam": did not resurface.
- Meet5 €5 premium: unconfirmed.
- Hey! VINA: likely defunct (undated competitor post).

**Gaps filled or still open**
- SLC: no evidence that Timeleft or 222 operates in Salt Lake City (3 searches for Timeleft, 1 for 222). Still worth checking in-app.
- Brand voice and push copy: no verbatim push copy for either company. Timeleft's notification touchpoints are documented; 222's voice is "relationships company", "IRL future", "no profiles, no DMs, no scrolling, no swiping".
- Still open: 222 mutual-reveal mechanics, visual design for both, primary retention numbers, "Tuesdays", "Kindred", "Clyde".
