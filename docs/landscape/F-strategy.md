> **Research memo, 2026-10-17.** Point-in-time evidence behind [`../LANDSCAPE.md`](../LANDSCAPE.md). Claims carry their verification tags; product truth lives in `src/lib/features.ts`. Do not update this file as the product changes; update `LANDSCAPE.md`.

# Switchboard Market Strategy Memo: Friends-First Plan-Making in Salt Lake City

Prepared 2026-10-17. Research memo for founders and investors.

## How to read the sourcing

Every factual claim carries one of three tags:

- **[V]** I confirmed it in a web search during this session. A URL is given inline.
- **[U]** Search found it, but only on an aggregator, or sources conflict. Treat it as directional.
- **[K]** It comes from my prior knowledge (training data through mid-2026) and was **not** re-checked this session. Verify it before it goes into a deck.
- **[V-corrected]** The original claim was wrong or imprecise; the text now carries the corrected figure and a URL (added in the 2026-10-17 verification pass).

Two limits on this session: the shared web-search budget ran out partway through section 2, and WebFetch could not resolve any host (DNS failures on techcrunch.com, wikipedia.org and cnbc.com). Sections 2 through 5 therefore lean on [K] more than I would like. Section 9 lists what to verify first.

---

## 1. Market map and money (2022 to 2026)

### 1.1 Funding table

| Company | Model | Latest known round | Notes |
|---|---|---|---|
| **Partiful** | Free invite pages for friend parties, guests RSVP by SMS or web with no download | $20M Series A1, late 2022, led by a16z. PitchBook (via TechCrunch) puts total funding at $27.34M and the **pre-money valuation at $120M** [V] ([TechCrunch, Nov 2024](https://techcrunch.com/2024/11/18/partiful-is-googles-best-app-of-2024/)) | Google Play "Best App" 2024 [V]. TIME100 Most Influential Companies 2025 [U] (unconfirmed after recheck). Sensor Tower estimates via CNBC put Partiful at an average of about 500K MAU in Q1 2025, up 400% YoY, about 90% of them in the US, against Eventbrite's 4.4M MAU (+2%) [V] ([CNBC, syndicated by NBC Connecticut](https://www.nbcconnecticut.com/news/business/money-report/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple/3547391/)). New-user counts for 2025 still range from 2M to 5M depending on the source [U] ([DailyDropout](https://www.dailydropout.fyi/startup/partiful), [NoGood](https://nogood.io/blog/partiful-marketing-strategy/)). Revenue is reportedly minimal, with first monetization through an Instacart group-order feature [U]. No 2025 or 2026 round found on recheck: CB Insights and Tracxn still list the Nov 2022 $20M Series A (a16z lead; Benchmark and NEA also named) as the latest round, with about $27.3M raised in total [V] ([CB Insights](https://www.cbinsights.com/company/partiful/financials), [Tracxn](https://tracxn.com/d/companies/partiful/__IuAGx5bkqe2kS6Po3wtoYHAKG3UWFMhBkoLlXhuHNIo/funding-and-investors)). |
| **Luma** | Event pages, calendars and ticketing for creators and communities | $3M seed, Dec 2020, co-led by Maven Ventures and Venrock [V] ([Crunchbase News](https://news.crunchbase.com/startups/exclusive-luma-raises-3m-to-enable-business-growth-on-top-of-zoom/), [Preqin](https://www.preqin.com/data/profile/asset/luma--inc-/405178)) | Around 2M people sign up for events on Luma each month [U] ([Social Discovery Insights, May 2024](https://www.socialdiscoveryinsights.com/2024/05/16/luma-event-planning-app-sees-impressive-user-growth/)). One blog claims a $12M Series A in 2024 [U] (unconfirmed after recheck: searches surface only the 2020 seed, and most "Luma Series A" hits are Luma AI or an unrelated Wi-Fi company). The domain has moved from lu.ma to luma.com [V]. Do not confuse it with **Luma AI**, the video model company. |
| **Timeleft** | Matches six strangers for a Wednesday dinner, paid per event or by subscription | One aggregator reports a **$7.0M Series A, €18M ARR and 150K monthly users**, growing from 4 to 90+ staff in 20 months [U] ([Signalbase](https://www.trysignalbase.com/news/funding/timeleft-raises-70m-series-a-funding)). An Apr 2026 profile repeats €18M ARR and 150K monthly users [U] ([ARR.club](https://www.arr.club/timeleft/timeleft-reaches-18m-arr-with-150k-monthly-users)). PitchBook shows only about $2M raised and Dealroom lists no known external funding [U] ([PitchBook](https://pitchbook.com/profiles/company/484635-34)). (Unconfirmed after recheck: no primary announcement or round date was found. Do not put a Timeleft round in a deck without one.) | About 6,500 dinners a week across 200+ cities in 52 countries [U] ([Tasting Table](https://www.tastingtable.com/1859085/dinner-parties-with-strangers-timeleft/)) (unconfirmed after recheck: other reports give anywhere from 185 to 300+ cities and up to 11,500 diners a week, depending on date). €12.99 per dinner in Belgium [V] ([Brussels Times](https://brusselstimes.com/1160308/table-for-six-strangers-fighting-urban-loneliness-over-dinner)). Restaurants receive guaranteed table volume, and the company charges them a fee [V] (same source). |
| **222** | AI-matched small-group nights out with strangers | $2.5M seed in 2024 (1517 Fund, General Catalyst, Best Nights VC). **$10.1M Series A dated 2025-12-23**, about $12.05M raised in total [V, aggregator-confirmed] ([CB Insights](https://www.cbinsights.com/company/222/financials), [Seedtable](https://seedtable.com/companies/222/funding-rounds/series-a-2025-12), [Techleap](https://finder.techleap.nl/news/feed/ai-powered-offline-meetup-platform-222-raises-10-1m-series-a)). Upfront Ventures reportedly led it [U]. | $22.22 per curation, or a $22.22 monthly subscription [V] ([TechCrunch friendship-app roundup](https://techcrunch.com/2026/04/05/as-people-look-for-ways-to-make-new-friends-here-are-the-apps-promising-to-help/)). No primary press release found. |
| **Pie** | AI places event attendees into groups of six (Andy Dunn, cofounder of Bonobos) | **$11.5M Series A, Sep 2024, led by Forerunner (Kirsten Green)**, bringing the total to $24M [V] ([Fitt Insider](https://insider.fitt.co/pie-raises-11-5m-for-irl-friendships/), [Pulse 2.0](https://pulse2.com/pie-social-app-company-raises-11-5-million-series-a/)) | 130K+ MAU in Mar 2025 [V] ([TechCrunch](https://techcrunch.com/2025/03/04/andy-dunns-new-app-pie-uses-ai-to-help-you-make-friends)). A later TechCrunch item reports about 300K users [U] (date unclear after recheck). Launched in Chicago, then San Francisco in Nov 2024 [V]. |
| **Howbout** | Social calendar you share with friends | **$8M Series A, Sep 2024, led by Goodwater**, with FJ Labs and Sequel. Total raised exceeds $13M [V] ([TechCrunch](https://techcrunch.com/2024/09/13/howbout-raises-8m-from-goodwater-to-build-a-calendar-that-you-can-share-with-your-friends)) | Founded in the UK in 2020. |
| **Saturn** | Class-schedule calendar for high schools, used in 17,000+ US schools | Backed by General Catalyst, Coatue and Sound Ventures [V] ([SV Angel jobs](https://jobs.svangel.com/companies/saturn-technologies)). **Acquired by Snap** and kept as a standalone app [V] ([Lindsey Gamble](https://www.lindseygamble.com/blog/snapchat-acquires-saturn-a-calendar-app-for-high-school-and-college-students)). | Snap confirmed the deal on **2025-06-20**; terms were not disclosed. Snap said Saturn reaches about 80% of US high schools [V-corrected] ([TechCrunch](https://techcrunch.com/2025/06/20/snap-acquires-saturn-a-social-calendar-app-for-high-school-and-college-students)). |
| **Posh** | Ticketing and discovery for nightlife and social events | **$22M Series A, Jul 2024, led by Goodwater** with FirstMark, bringing the total to $31M [V] ([TechCrunch](https://techcrunch.com/2024/07/23/event-startup-posh-raises-22m-in-to-focus-on-personalisation-and-event-diversification), [MBW](https://www.musicbusinessworldwide.com/small-events-platform-posh-raises-22m-in-series-a-round/)). **$37M Series B, announced 2026-03-19, led by FirstMark**, with Goodwater, Causeway, Companyon and Epic Ventures. Fortune reports about $10M of 2024 revenue on $83M+ of ticket sales, $350M cumulative GMV and 25M tickets sold; user counts differ by outlet (about 6M to 8M) [V] ([Fortune](https://fortune.com/2026/03/19/exclusive-posh-lands-37m-series-b-what-are-we-doing-tonight-problem/), [FirstMark](https://firstmark.com/story/fortune-exclusive-posh-raises-37m-series-b/), [Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/live-events-platform-posh-raises-182651833.html)). | Fee is **10% plus $0.99 per ticket** [V, reconfirmed in the Fortune Series B story]. In-app marketplace orders rose from 6% to 12% of ticket orders between Jan and Jun 2024 [V]. |
| **Bumble BFF** | Friend-finding app, rebuilt around groups | Bumble bought Geneva for about **$17.0M in cash, closing 2024-07-01** [V] ([Bumble 10-Q](https://www.sec.gov/Archives/edgar/data/1830043/000095017024093910/bmbl-20240630.htm)). The BFF relaunch on Geneva's technology was announced **2025-09-18** [V] ([TechCrunch](https://techcrunch.com/2025/09/18/bumble-bffs-revamped-app-is-here-focusing-on-friend-groups-and-community-building), [Global Dating Insights](https://www.globaldatinginsights.com/featured/bumble-bets-big-on-friendships-with-revamped-bff-app/)) | **Geneva had generated no revenue as of 2025-06-30** [V]. Group discovery was slated for Feb 2026 [V]. Whitney Wolfe Herd returned as CEO in Mar 2025 [V] ([Fortune](https://fortune.com/2025/03/26/bumble-whitney-wolfe-herd-founder-back-as-ceo-interview-love-company)). Bumble cut about 30% of staff (about 240 roles), disclosed in an 8-K on 2025-06-25 [V] ([Fortune](https://fortune.com/2025/06/25/bumble-layoffs-surprise-jpmorgan-analysts)). |
| **Meetup** | Interest groups funded by organizer subscriptions | Bending Spoons completed the acquisition in **Jan 2024** and moved operations to Europe, which meant large US layoffs [V] ([TechCrunch](https://techcrunch.com/2024/02/15/evernote-and-meetup-owner-bending-spoons-raises-155m-in-equity-financing/), [Silicon Republic](https://www.siliconrepublic.com/business/bending-spoons-funding-acquisitions-apps-meetup-evernote)) | Bending Spoons also bought **Eventbrite for about $500M in cash ($4.50 a share)**, announced in Dec 2025 [V] ([Skift Meetings](https://meetings.skift.com/2025/12/02/bending-spoons-to-acquire-eventbrite-in-500-million-cash-deal/), [Il Sole 24 Ore](https://en.ilsole24ore.com/art/bending-spoons-targets-live-events-500-million-eventbrite-AIMhnaC)). Bending Spoons' own SEC 6-K states "On March 10, 2026, we acquired" Eventbrite [V] ([SEC 6-K](https://www.sec.gov/Archives/edgar/data/0002004711/000200471126000011/bsp_ex99-2.htm)). Bending Spoons has also filed an F-1/A registration statement with the SEC [V] ([SEC F-1/A](https://www.sec.gov/Archives/edgar/data/0002004711/000110465926076487/tm2613674-10_f1.htm)). The claim that the Flex plan was replaced by paid Pro tiers comes only from competitor blogs that disagree on prices [U] (unconfirmed after recheck) ([TickPick](https://www.tickpick.com/blog/organizer/eventbrite-2026-fee-changes), [TicketSignup](https://info.ticketsignup.io/2025/12/09/eventbrite-acquired/)). |

### 1.2 Notable IRL social rounds, 2025 and 2026

- **Sweatpals** (Austin; fitness events as the new place to meet people): **$12M seed, Oct 2025**, led by Patron, a16z speedrun and Kevin Hart's HartBeat Ventures, for $17.2M total. It reports 1M+ monthly users, 60% of them women aged 20 to 35, and planned to grow from 24 to 36 cities by early 2026 [V] ([Fitt Insider](https://insider.fitt.co/sweatpals-raises-12m-to-power-social-fitness/), [Tech Funding News](https://techfundingnews.com/sweatpals-lands-12m-from-patron-a16z-speedrun-to-build-the-future-of-fitness-social-networking/)).
- **Clyx** (aggregates events and matches attendees with compatible people): **$14M Series A, Sep 2025**, led by Blitzscaling Ventures. It has 50K active ticket buyers and 200K+ browsers in Miami and London [V] ([TechCrunch](https://techcrunch.com/2025/09/10/this-gen-z-founded-app-just-raised-14m-to-take-on-the-loneliness-episdemic), [Techleap](https://finder.techleap.nl/news/feed/clyx-raises-14m-to-combat-loneliness)).
- **Friending** (UK): **£5M seed**. Chat messages delete after 48 hours, which pushes people to meet in person. The date is unclear, probably 2025 or 2026 [U] ([Dating Industry Insights](https://www.datingindustryinsights.com/news/friending-app-combats-loneliness-in-person)).
- **222**: $10.1M Series A, Dec 2025 [U] (see the table).
- **Category size.** Appfigures, via TechCrunch, estimates that more than a dozen local friendship apps generated about **$16M in US consumer spending and 4.3M downloads in 2025 year to date** [V] ([TechCrunch](https://techcrunch.com/2026/04/05/as-people-look-for-ways-to-make-new-friends-here-are-the-apps-promising-to-help/)). Recheck note: the article text says "thus far in 2025" and a syndicated copy links a 2025-12-26 version, so the 2026-04-05 URL date reflects a republish. Cite it as a 2025 figure, not a 2026 one, and as an Appfigures estimate. That is small. Paying consumers for friendship is still a niche market.
- **Funding climate.** Tracxn counts **$1.26B** of US "loneliness economy" equity across 94 rounds in 2025, about **17% below 2024**. Its definition is broad and includes eldercare and AI companions [U] ([Tracxn](https://tracxn.com/d/explore/loneliness-economy-startups-in-united-states/__yiMQIXNPZ9N7jV608qgeJHgo7COg6h0h0HUPm9bWCRE)). AI companion apps reached about $82M in H1 2025 and are on track for $120M+ for the year [U] ([Appfigures via TechCrunch](https://www.everydays.wtf/link-appfigures-ai-companion-apps-are-on-track-to-generate-120m-in-revenue-in-2025-and-in-h1-there-were-60m-downloads-of-this-kind-of-app-up-88-yoy-sarah-perez-techcrunch/)). That is the competing "synthetic connection" thesis.
- **Incumbent move.** **Apple Invites** launched 2025-02-03 as an iPhone app plus icloud.com/invites. Creating an event requires iCloud+, and anyone can RSVP, in the app or on the web, without an Apple Account or Apple device [V] ([Apple via Business Wire](https://www.businesswire.com/news/home/20250203932522/en/Introducing-Apple-Invites-a-new-app-that-brings-people-together-for-life%E2%80%99s-special-moments)). Apple now sits inside the iMessage-native invite flow.

### 1.3 Investor theses (verified quotes only)

- **Andrew Chen (a16z speedrun)** on Sweatpals: the company "has cracked the code on making community building both meaningful and economically sustainable" [V] ([Tech Funding News](https://techfundingnews.com/sweatpals-lands-12m-from-patron-a16z-speedrun-to-build-the-future-of-fitness-social-networking/)). The thesis is that IRL social is fundable when there is a payer, in this case gyms and instructors.
- **Sweatpals founder Salar Shahini:** "We're building the infrastructure for human connection in an increasingly lonely world" [V].
- **Andy Dunn (Pie)** explains why one-to-one friend matching fails: "A friendship match becomes a standoff, where neither person wants to make the first move" [V] ([TechCrunch](https://techcrunch.com/2025/03/04/andy-dunns-new-app-pie-uses-ai-to-help-you-make-friends)). **This is the best external validation of Switchboard's thesis.** Pie's answer was to go group-first with strangers. Switchboard's answer is mutual reveal plus friends-first.
- **Policy backdrop.** US Surgeon General Vivek Murthy's May 2023 advisory "Our Epidemic of Loneliness and Isolation" said about half of US adults report loneliness, with a mortality impact comparable to smoking up to 15 cigarettes a day [V] ([Axios](https://www.axios.com/2023/05/03/surgeon-general-vivek-murthy-fights-loneliness)). The 15-cigarettes comparison is contested by critics as an indirect estimate, so quote it as the advisory's claim.
- **General Catalyst** backs both 222 and Saturn. **Goodwater** led both Posh and Howbout. Those two firms are the clearest repeat buyers of "Gen Z coordination" consumer bets [V from the rounds above, my inference].
- I could not retrieve primary a16z or General Catalyst essays that use the phrases "loneliness economy" or "IRL renaissance". Do not attribute either phrase to a named firm without a source.

---

## 2. Post-mortems and cautionary tales

| Product | What happened | Lesson for Switchboard |
|---|---|---|
| **IRL** (2023) | Raised a $170M Series C led by SoftBank at a **$1.17B** valuation. A board investigation found **95% of its reported 20M users were bots**, and it shut down in Jun 2023. SoftBank sued for $150M [V] ([TechCrunch](https://techcrunch.com/2023/06/26/irl-shut-down-fake-users/), [Fortune](https://fortune.com/2023/06/25/irl-shutting-down-startup-admits-95-percent-of-messaging-app-users-were-fake)). The SEC charged CEO Abraham Shafi in Jul 2024, alleging the app looked organically viral while it spent millions on incentivized download ads [V] ([TechCrunch](https://techcrunch.com/2024/07/31/founder-behind-social-media-app-irl-charged-with-fraud)). Recheck note: the 95% finding comes from the board's internal investigation (first reported by The Information); the founders deny it and countersued investors [V] ([Fortune](https://fortune.com/2023/11/16/irl-app-cofounders-lawsuit-suing-investors)). Say "a board investigation found", not "IRL had". | Report plans that actually happened. Count people who arrived, not signups. Investors in this category now ask for proof of real-world attendance. |
| **Clubhouse** | Valued at $4B in Apr 2021. Installs fell from 9.6M in Feb 2021 to about 922K in Apr. In Apr 2023 it laid off more than half its ~200 staff and pivoted to async voice with friends [V] ([CNBC](https://www.cnbc.com/2023/04/27/clubhouse-layoffs-app-reached-4-billion-valuation-during-pandemic.html), [TheWrap](https://thewrap.com/clubhouse-monthly-downloads-plunge-72-percent)). | Novelty from an external shock (lockdown) is not retention. Twitter Spaces copied the feature within months. A mechanic alone is copyable, but a local graph is harder to copy. |
| **Zenly** | Snap announced the closure on 2022-08-31 alongside a 20% layoff, citing the low likelihood of a meaningful profit, and shut it on **2023-02-03** despite a reported 40M+ MAU [V] ([Pragmatic Engineer](https://blog.pragmaticengineer.com/zenly/), [Rest of World](https://restofworld.org/2022/fearing-competition-snap-decided-to-shut-down-zenly-rather-than-sell-it/)). The exact shutdown date and the 40M figure come from Life360, a competitor ([Life360 blog](https://www.life360.com/en-ca/blog/what-happened-to-zenly)). | Love without revenue is fragile, especially once a corporate parent owns you. Build the monetization path early, even if you switch it on late. |
| **Down to Lunch** | Reached No. 2 in the US App Store in early 2016. Complaints about address-book invite spam led the founder to remove the feature, and a class action followed. A trafficking hoax also circulated. It was off the stores by 2018 [V] ([SCMP](https://amp.scmp.com/tech/social-gadgets/article/1940358/startup-reaches-no-2-us-app-store-despite-human-trafficking), [Digital Trends](https://www.digitaltrends.com/social-media/down-to-lunch-connect-friends/), [BYU Universe, Jan 2016](https://universe.byu.edu/2016/01/22/students-across-campus-are-asking-each-other-are-you-down-to-lunch/)). | It was the closest ancestor to Switchboard's availability signals, and it spread through BYU and Utah campuses. Its growth loop (auto-invite contacts) was also its reputational poison. Switchboard's "no address-book spam" rule doubles as a moat. |
| **Houseparty** | Peaked in 2020; reported peak downloads range from 17M (Mar 2020) to about 24M (Q2 2020) depending on source and metric. Epic announced the shutdown on 2021-09-09, pulled the app at once and ended service in Oct 2021 to focus on "metaverse scale" [V] ([TechRadar](https://www.techradar.com/news/partys-over-for-houseparty-as-epic-games-announces-imminent-shutdown)) ([Pocket-lint](https://www.pocket-lint.com/apps/news/epic-games/158349-houseparty-is-closing-so-you-ll-have-to-use-zoom-like-everyone-else), [ProductMint](https://productmint.com/what-happened-to-houseparty/)). | It was a synchronous "who's free now" tool. Without a reason to open the app, presence decays. |
| **Meetup fee backlash** | Oct 2019, under WeWork: a test charged attendees **$2 per RSVP** while cutting organizer fees. One estimate showed a weekly group of 30 going from $20 to $242 a month, a 1,210% increase. Meetup retreated and laid off about 25% of staff two weeks later [V] ([The Register](https://www.theregister.com/2019/10/15/meetup_fee_increase_backlash), [freeCodeCamp](https://www.freecodecamp.org/news/the-wework-meetup-debacle-and-a-new-chapter/), [NBC](https://www.nbcnews.com/tech/tech-news/meetup-was-darling-tech-industry-can-it-survive-wework-n1106676)). | Never tax the act of saying yes. Charge the party that captures the value (the host or the venue), and never the guest's RSVP. |
| **Bumble BFF / Geneva** | BFF has existed since 2016. In 2025 it was rebuilt on Geneva, a $17M acquisition with zero revenue, and Geneva itself shut down into BFF [V]. | Even a dating giant with distribution has struggled to make swipe-based friendship work. One-to-one friend matching makes people fear rejection. |
| **Path** | Capped friend lists at 50, later 150 [K]. Settled with the FTC in Feb 2013: the FTC charged it with deceptively collecting address books, but the **$800K civil penalty was for COPPA violations** (collecting data from children) [V-corrected] ([PCWorld](https://www.pcworld.com/article/456702/ftc-fines-maker-of-path-app-800-000-for-privacy-violations.html), [MediaPost](https://www.mediapost.com/publications/article/192520/path-settles-ftc-privacy-charges.html)). Sold to Kakao in 2015, announced its closure on 2018-09-17 and shut down on 2018-10-18 [V] ([TechCrunch](https://techcrunch.com/2018/09/17/rip-path/), [VentureBeat](https://venturebeat.com/ai/social-networking-app-path-will-close-down-october-18)). | The "intimate network" positioning worked, but you cannot grow an intimate network through growth hacks without breaking trust. |
| **Yik Yak (first life)** | Valued around $400M in 2014 [V]. Campus bullying, high-school bans and mandatory handles then hurt engagement; 2016 downloads fell 76% from 2015 [K for causes]. Shutdown announced 2017-04-28, with Square paying about $1M for the engineering team. A new team bought the brand from Block in Feb 2021 and relaunched it, and Sidechat bought it in Mar 2023 [V] ([Fortune](https://www.fortune.com/2017/04/29/yik-yak-officially-calls-it-quits), [EdSurge](https://www.edsurge.com/news/2017-05-01-anonymous-messaging-app-yik-yak-is-shutting-down), [TechCrunch](https://techcrunch.com/2023/04/03/yik-yak-users-are-protesting-the-apps-makeover-after-acquisition-by-sidechat/amp/)). | Anonymity without accountability turns toxic. Switchboard's anonymity is scoped tightly (votes and unrequited interest only), which is correct. |
| **Foursquare / Swarm** | Check-ins peaked around 2012 to 2014. The app split into Foursquare and Swarm in 2014. The consumer **Foursquare City Guide mobile app shut down on 2024-12-15** (web version on 2025-04-28), while Swarm survives [V] ([Foursquare](https://foursquare.com/city-guide-sunset/)). | Broadcasting your location as a social habit decays. Foursquare survived by selling location data B2B, a path Switchboard should explicitly reject. |
| **Facebook Events** | Teen Facebook use fell from 71% (2014-15) to 32% (Pew, survey of Sep to Oct 2024) [V] ([Pew](https://www.pewresearch.org/internet/2024/12/12/teens-social-media-and-technology-2024/)). Facebook's standalone Events/Local app was retired [K]. | The gap left by Facebook Events is what Partiful, Luma, Posh and Apple Invites are filling. That gap belongs to the generation that never had Facebook. |
| **Hey! VINA, Patook, Friended** | Friend-matching apps from 2015 to 2018, each with a gimmick: female-only for VINA, an anti-flirting filter for Patook. Each faded with little traction [K, low confidence on exact dates and status]. | One-to-one stranger friendship apps rarely reach density. The "standoff" problem Dunn describes applies to them too. |

The common pattern: products die either from **trust failure** (spam, bots, bullying, privacy) or from **having no reason to come back** (Houseparty, Clubhouse, Zenly with no revenue). Switchboard's consent mechanics address the first. Its weekly plan rhythm and venue revenue must address the second.

---

## 3. Cold start and network effects for a local social product

### 3.1 Frameworks that apply

- **Atomic networks (Andrew Chen, *The Cold Start Problem*, 2021) [K].** The smallest network that is stable on its own. For Switchboard, this is a **friend group of 6 to 12 people who make at least two plans a month**, not a city. The "hard side" is the **host**: the person in every group who actually organizes. Tinder seeded USC sororities and fraternities at parties. Slack seeded whole teams.
- **"Come for the tool, stay for the network" (Chris Dixon, 2015) [K].** Partiful and Luma both work alone. One host gets a beautiful page and RSVP tracking, and guests need no account [V on guest web RSVP]. Switchboard's single-player tool is the cascading invite. A host gets value even if nobody else has the app, because invitees answer by SMS (`docs/SMS.md` shows `YES <code>` / `NO <code>` replies). **Lead with that.**
- **Density thresholds.** The network-dependent features (serendipity zones, Mutual, people discovery, Open Table) need a local density that the planning tool does not. Sequence it so the network features unlock by **neighborhood or campus** after a plan threshold is crossed, and hide them before that. An empty map is worse than no map.
- **City-by-city precedents.** Pie launched in Chicago first, then SF [V]. Clyx operates in Miami and London only [V]. Sweatpals runs in 24 to 36 cities [V]. Timeleft opens a city by guaranteeing restaurants two tables a month [V]. Down to Lunch spread campus to campus, including BYU [V].

### 3.2 Salt Lake City: advantaged or disadvantaged?

Demographic facts below were rechecked on 2026-10-17; tags are inline. Pull exact figures from the Census ACS and the Kem C. Gardner Policy Institute before investor use.

**Advantages**

- **Youngest state.** Utah's median age is **32.4** (Census Vintage 2024 estimates; the 2024 ACS 1-year gives 32.0), the lowest of any state against 39.1 nationally, though Utah is also aging fast [V] ([Salt Lake Tribune](https://sltrib.com/news/2024/09/18/utah-is-getting-older-more-diverse), [KSL](https://www.ksl.com/article/news/utah/census-data-these-2-utah-counties-have-the-lowest-median-ages-in-the-nation/50672023)). Its average household size has been the largest of any state since 1980: 3.12 in the 2015 to 2019 ACS, and about 3.0 (2.97) in 2024 per a secondary ranking [V] ([Gardner Institute](https://gardner.utah.edu/wp-content/uploads/5year-ACS-FactSheet-Jan2021.pdf), [World Population Review](https://worldpopulationreview.com/state-rankings/average-household-size-by-state)). Many young adults are making plans.
- **High baseline social capital.** The JEC Social Capital Project (Apr 2018) ranked Utah No. 1, ahead of Minnesota and Wisconsin, and Utah Foundation says it was still first in 2025 [V] ([Sen. Lee / JEC](https://www.lee.senate.gov/2018/4/utah-tops-social-capital-index-of-united-states), [Utah Foundation](https://www.utahfoundation.org/wp-content/uploads/rr837.pdf)). Utah ranked first for formal volunteering (46.6%) in the 2023 Volunteering and Civic Life in America survey [V] ([AmeriCorps](https://americorps.gov/newsroom/news/utahns-spent-more-114-million-hours-volunteering-last-year-impact-experts-say-made)). People here already organize, so the hosts exist.
- **Dense, legible institutions.** Fall 2025 headcounts: University of Utah **38,261** (a record) [V-corrected] ([U of U](https://attheu.utah.edu/students/ushe-reports-historic-enrollment-and-completion-data-for-the-university-of-utah/)); Utah Valley University **48,670**, the state's largest [V-corrected] ([UVU](https://www.uvu.edu/news/2025/fall-2025-enrollment.html)); BYU **37,205** daytime students [V-corrected] ([BYU](https://www.byu.edu/facts-figures)); SLCC **31,473**, including about 10,100 concurrent high-school students [V] ([Utah Business](https://www.utahbusiness.com/press-releases/2025/10/17/salt-lake-community-college-sees-highest-enrollment-since-pre-pandemic/)). Westminster (now Westminster University) is small, about 1 to 2K [K]. UVU and BYU are about 45 minutes south. The repo already ingests SLCC and Salt Lake County events (`docs/SLC_EVENT_SOURCES.md`).
- **Silicon Slopes.** Qualtrics, Domo, Pluralsight, Podium, Weave, Instructure and Recursion bring transplants who arrive with no local graph [K]. That is the classic "new in town" wedge.
- **Calendar-driven outdoor culture.** About 10 to 15 resorts sit within an hour, along with trail running, climbing and float trips. Ski days, carpools and powder mornings are inherently **cascading, capacity-limited plans**: four seats in a car, one at a time [K]. The IOC awarded the **2034 Winter Olympics** to SLC on 2024-07-24, which gives a long civic-pride runway [V] ([KUER](https://www.kuer.org/sports-recreation/2024-07-24/its-official-the-winter-olympics-are-coming-back-to-salt-lake-city-in-2034)).
- **Manageable size.** The Salt Lake City metro area had about **1.30M** people in the Census July 2024 estimate (Salt Lake County about 1.22M; the city itself about 218K) [V] ([USAFacts](https://usafacts.org/answers/how-many-people-live-in-the-us/metro-area/salt-lake-city-ut/)). It is small enough to saturate with a few hundred atomic networks and large enough to prove a playbook. Local press (City Weekly, SLUG, KRCL) is reachable.

**Disadvantages and nuances**

- **Two social graphs.** The LDS share of Utah depends on the definition [V-corrected]: **42% self-identify** as Latter-day Saints in a Dec 2023 *Journal of Religion and Demography* study (covered by the Tribune), Pew's 2023-24 Religious Landscape Study puts it at **about half**, and church rolls report about 64% ([Salt Lake Tribune](https://www.sltrib.com/religion/2023/12/28/turns-out-latter-day-saints-are/), [Religion News Service](https://religionnews.com/2023/12/28/study-utah-is-no-longer-a-majority-mormon-state/), [Deseret News](https://www.deseret.com/faith/2025/02/28/utah-religious-makeup/)). Always state which measure you cite. **Salt Lake County fell to 49% LDS on church rolls** (active and inactive members) in church figures reported by the Tribune and AP around 2018, and the active share is far lower [V] ([KJZZ / AP](https://kjzz.com/news/local/new-figures-show-lds-members-a-minority-in-salt-lake-county)). LDS social life is heavily pre-structured: ward activities, Young Single Adult (YSA) wards, Monday family home evening, Sunday observance, and no alcohol. The non-LDS, transplant and ex-LDS graph in SLC proper is **lonelier and less structured**, and it is the better initial market. The two graphs overlap little, so treat them as **separate atomic-network pools** with different defaults (dry venues, Sunday-light calendars, family plans).
- **Early marriage and big families** shrink the 25-to-35 single population compared with Denver or Austin [K]. Household plans (the repo already has `households`) and parent-friendly scheduling matter more here than in a typical "friends app" market.
- **Liquor-law friction** makes bars less central. Venue partners skew to coffee, "dirty soda" (Swig and peers), climbing gyms, breweries with food, and outdoor outfitters [K]. Perks should not assume a bar-crawl economy.
- **Small venture press footprint.** An SLC win reads as "regional" to coastal investors unless the metrics are framed as replicable (cost per active atomic network, plans per host per month).

**Verdict:** SLC is **advantaged for the planning tool** (young, organized, calendar-heavy, outdoor capacity constraints) and **neutral to disadvantaged for stranger discovery** (smaller single pool, split graph). That argues for friends-first in SLC, with discovery opened only in dense pockets (the U of U campus, downtown/Granary/Sugar House, and climbing gyms).

---

## 4. Monetization that does not corrupt connection

| Model | Who uses it | Evidence | Fit for Switchboard |
|---|---|---|---|
| **Ticketing fee** | Posh (10% + $0.99) [V], Luma (5% platform fee on paid tickets on the free plan [V] ([Luma help](https://help.luma.com/p/luma-plus-overview))), Eventbrite | Works for public, paid events. | Low for friend plans, which are mostly free. Medium later for paid community events. |
| **Host subscription** | Luma Plus (0% platform fee, Stripe fees still apply; about $59/mo billed annually, more month to month [V] ([Luma pricing](https://luma.com/pricing?locale=ja), [Luma help](https://help.luma.com/p/luma-plus-overview))), Meetup organizer dues ($23.99/mo in the 2019 test [V]) | Works when hosts are semi-professional (run clubs, community organizers). | **Good for "Pro hosts"**: recurring rituals, co-host teams, CSV export, analytics, custom domains. Never gate the core cascade. |
| **Per-event payment by the attendee** | Timeleft (€12.99) [V], 222 ($22.22) [U] | Works for **stranger** curation, because the fee filters out flakes and funds the matching. About $16M of US category spend in 2025 [V]. | Possible for Open Table seats with strangers. **Never for friend plans.** |
| **Venue partnerships (B2B2C)** | Timeleft guarantees restaurants table volume for a fee [V]. Sweatpals sells tools to gyms and instructors [V], which is the model a16z called "economically sustainable". | Strongest evidence that IRL social can be monetized without ads. | **Primary.** Venues pay for verified, group-sized foot traffic on slow nights. Switchboard already ships `venue-perks` and `verified-places`. |
| **Commerce add-ons** | Partiful's Instacart group order [U] | Early-stage. | Medium: group orders, ski-rental and carpool bundles. |
| **Premium themes and cosmetics** | Partiful-style page aesthetics [K] | Small revenue, but positive and no pressure. | Small add-on. |
| **Sponsorship** | Brand-sponsored events [K] | Can feel inauthentic. | Only as clearly labeled "presented by" on public events. |
| **Data or ads** | Foursquare's B2B data pivot [K] | Corrodes trust. | **Reject explicitly.** Make that a marketing claim. |

**What hurt communities:** Meetup's 2019 per-RSVP tax [V], and Bending Spoons' playbook of tightening free tiers and raising paid prices after an acquisition [U]. Both teach the same lesson: monetize the party that captures surplus, keep the guest path free forever, and pre-announce pricing with long grandfathering.

---

## 5. Distribution channels

- **iMessage and SMS link previews.** This is Partiful's core loop: the invite is a link in the group chat, and the guest RSVPs on the web [V that guests need no app]. Open Graph image quality decides whether the link gets tapped. Switchboard already has an OG route and `share-link.ts`. The rich preview *is* the ad. A2P-registered SMS (which Switchboard has) is rare among competitors and lowers friction for older and non-app users [repo].
- **TikTok and IG creator content.** Timeleft's growth is widely attributed to creator videos of "I had dinner with 5 strangers" [K, not verified this session]. The equivalent format for Switchboard is "I asked my friends one at a time and nobody knew they were second", a story with suspense built in.
- **Campus ambassadors.** Partiful and Posh have used student ambassadors and party hosts [K]. Saturn grew school by school to 17K+ high schools, and Snap said about 80% of US high schools by Jun 2025 [V]. Down to Lunch spread across BYU [V].
- **Creator calendars.** Luma grew by becoming the default calendar for tech meetups and communities [K]. The SLC analogue is run clubs, climbing gym socials, Silicon Slopes meetups, and the U's student orgs.
- **PWA versus native, the tradeoffs:**
  - **iOS web push** has worked for home-screen web apps since **iOS 16.4 (Mar 2023)**, and only for apps installed to the Home Screen; the permission prompt must follow a user gesture, and a denied permission generally means removing and re-adding the app [V, developer-vendor docs] ([Pushpad](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications), [OneSignal](https://documentation.onesignal.com/docs/en/web-push-for-ios)). In Feb 2024 Apple said it would drop home-screen web apps in the EU for iOS 17.4, then reversed the decision before release [V] ([Engadget](https://www.engadget.com/apple-backtracks-on-plans-to-get-rid-of-web-apps-on-iphones-in-the-eu-195232177.html)). **New in iOS 26:** every site added to the Home Screen opens as a web app by default (users can switch it off per site), which removes one failure mode for sites without a full manifest [V] ([WebKit](https://webkit.org/?p=16993), [heise](https://heise.de/-10749652)). Some developers report web push that works and then silently stops [U]. Install friction remains: iOS has no install prompt, so users must use Share and then "Add to Home Screen". Plan for a coached install moment after a first successful plan, not at signup.
  - **App Store discovery** matters because the Social Networking and Lifestyle charts rank partly on download velocity. A coordinated campus launch week can chart in a small category [K]. Down to Lunch hit No. 2 [V].
  - **App Clips** (iOS) can open an invite natively without an install. Size limits are 15MB for an App Clip targeting iOS 16+, and **100MB for iOS 17+ when the clip supports only digital invocations** (links, Safari banners, Messages, Spotlight), not physical ones like QR codes or NFC [V-corrected] ([Apple](https://developer.apple.com/help/app-store-connect/reference/maximum-build-file-sizes/)). An invite link opened from Messages is a digital invocation. An App Clip for "respond to this invite" removes the install wall for guests.
  - **Android TWA** (Trusted Web Activity, via Bubblewrap or PWABuilder) puts the PWA in Google Play cheaply [K]. On iOS, a thin native wrapper risks rejection under Guideline 4.2 (minimum functionality) unless it adds native value such as contacts, widgets, Live Activities or App Clips [K].
  - **Recommendation:** keep the PWA as the guest surface forever, because guests should never need an install. Ship a native iOS app for **hosts**, with widgets showing "who's free tonight", Live Activities for a cascade in progress, and an App Clip for RSVPs. Ship Android as a TWA. This matches the repo's Stage 2 proposal.
- **Apple Invites** (launched 2025-02-03; hosts need iCloud+, guests do not) is a strong default for iPhone-only friend groups [V for launch facts; K for the "default" judgment]. Compete on what Apple's product does not do: cascades, private polls, mutual matching, Android and SMS guests.

---

## 6. Positioning map

Axes scored 1 to 5 (1 = left label, 5 = right label). Scores are my analytical judgment, informed by the sources above.

| Product | Strangers (1) to Friends (5) | One-off (1) to Recurring (5) | Broadcast (1) to Targeted (5) | Host-centric (1) to Group-centric (5) | Aesthetic (1) to Utilitarian (5) |
|---|---|---|---|---|---|
| Partiful | 5 | 2 | 2 | 1 | 1 |
| Luma | 2 | 3 | 1 | 1 | 2 |
| Posh | 1 | 2 | 1 | 1 | 2 |
| Apple Invites | 5 | 1 | 2 | 1 | 1 |
| Timeleft / 222 / Pie | 1 | 4 | 4 (curated) | 4 | 3 |
| Sweatpals | 2 | 4 | 1 | 2 | 3 |
| Bumble BFF | 1 | 2 | 3 | 3 | 3 |
| Howbout / Saturn | 5 | 4 | 3 | 4 | 4 |
| Meetup | 1 | 5 | 1 | 2 | 5 |
| Group chat (iMessage/WhatsApp) | 5 | 3 | 2 | 5 | 5 |
| **Switchboard** | **4 (friends-first, strangers opt-in)** | **4 (rituals, run it back)** | **5 (cascade, one wave at a time)** | **4 (private polls, plan rooms)** | **3** |

**Whitespace.** Every funded friends-side tool (Partiful, Apple Invites, Posh, Luma) is **broadcast and host-centric**. The host sends one link to everyone, and the guest list is visible. Every funded **group-centric, targeted** product (Timeleft, 222, Pie) is about **strangers**. The quadrant **friends + targeted + group-centric** is occupied only by the group chat, which is exactly where plans die: nobody wants to be the one who asks, "who's in?" exposes the people who are not, and late invitees know they were backups.

Switchboard owns that quadrant if it positions on **consent**: nobody sees a no, nobody learns they were second, nobody's vote is exposed, and interest is revealed only when it is mutual. Pie's founder named the standoff [V]. Switchboard is the product built around ending it among people who already know each other.

---

## 7. Recommendations

### (a) Go-to-market in Salt Lake City

**Phase 0: Instrument and seed (now to Dec 2026, about 8 weeks)**
- Define the north-star metric as **plans that happened** (at least 2 confirmed attendees, place and time fixed, the date passed, at least one "we went" signal). This is a lesson from IRL [V].
- Recruit **40 "connector" hosts** by hand. Target the people who already organize ski carpools, run-club after-hangs, game nights, and climbing sessions. Sources: the U of U outdoor program, SLC climbing gyms, Silicon Slopes community leads, KRCL and SLUG readers. Give each a direct line to the founders.
- Make the cascade the hero: "Fill the car one seat at a time." Ski season opening (mid-Nov) is the forcing event.
- Hide discovery, zones and the map until a ZIP code or campus crosses a density threshold (proposal: 150 weekly active users within 3 km).

**Phase 1: Ski season atomic networks (Dec 2026 to Mar 2027)**
- Goal: **150 atomic networks** (groups with 2+ plans a month), 1,500 MAU, and at least 40% of guests answering by SMS or web without installing.
- Recurring rituals ("powder Fridays", "Sunday-light brunch") and "run it back" as the retention loop.
- **Five or six launch venue partners** for slow weekday nights: coffee, climbing gyms, a brewery with food, and a mocktail or "dirty soda" shop to cover the dry graph. Perks unlock for group check-ins, which gives a measurable foot-traffic report to the venue.
- Run separate playbooks for the **non-LDS transplant graph** (downtown, Sugar House, 9th and 9th) and the **YSA/LDS graph** (dry venues and family-friendly defaults). Do not mix the two communities' launch messaging.

**Phase 2: Campus and the new-in-town wedge (Jan 2027 to May 2027)**
- University of Utah spring semester. Use **20 paid student ambassadors** drawn from clubs, not from Greek life alone. Turn on Open Table and Mutual **inside the verified-school boundary** only, since the repo already verifies school and work.
- Silicon Slopes: partner with 3 to 5 employers' ERGs and onboarding teams ("your first 10 plans in SLC").
- Creator format: 30-second "I invited them one at a time" stories, seeded with 10 local creators. Measure links opened from TikTok bio links, not views.
- Native iOS host app and Android TWA ship here, timed to a campus launch week to concentrate store velocity.

**Phase 3: Summer and Wasatch Front expansion (Jun to Sep 2027)**
- Summer outdoor season (float trips, Uinta campouts, concerts at Red Butte and the Gallivan). Turn on serendipity zones at the Twilight-style concert series and the farmers market.
- Expand to Provo/Orem (BYU, UVU) only after SLC hits retention targets: **D30 host retention of at least 35%** and **at least 2.5 plans per active host per month** (targets proposed, not benchmarked).
- Then the next city would be **Boise, Denver or Austin**, each young, outdoor-heavy and full of transplants.

### (b) Monetization recommendation

1. **Guests free forever, and the core cascade free forever.** Publish this as a pledge. It is the anti-Meetup move [V].
2. **Primary revenue: venue partners (B2B2C).** Venues pay monthly (proposed $99 to $299) for verified group arrivals on chosen dayparts, perk placement in plan suggestions, and a monthly foot-traffic report. Use Timeleft's guarantee logic [V] in reverse: Switchboard guarantees **only verified visits**, never personal data.
3. **Secondary: Switchboard Host Plus** (proposed $5 to $8/mo or $49/yr) for power hosts and community organizers: recurring rituals at scale, co-host teams, analytics, guest CSV, custom themes, and paid-ticket support with **0% platform fee on Plus** (copying Luma's structure [V]).
4. **Tertiary: Open Table seat fee for stranger tables**, at $5 to $12, refundable on attendance. This keeps payment where the matching cost and flake risk are, as Timeleft and 222 do [V].
5. **Never:** ads, data sales, paid boosts in Mutual, or charges for seeing who is interested. Interest revealed only when mutual must stay unsellable.

### (c) The 8 biggest strategic risks and mitigations

1. **Apple Invites or Partiful copies the cascade.** *Mitigation:* the cascade is easy to copy, but **consent across the whole system** (private polls, no-reveal, mutual) and the local venue network are not. Ship fast, own the vocabulary ("cascade", "nobody sees a no"), and file a defensive design patent if counsel advises it.
2. **Cold start of the discovery features in a small, split market.** *Mitigation:* gate them by density. The planning tool must stand alone. Pick two dense pockets (the U and downtown/Sugar House) before any city-wide map.
3. **Install friction and iOS PWA limits throttle retention.** *Mitigation:* guests never install, thanks to SMS `YES <code>` replies and web RSVP. A native host app with widgets and an App Clip follows. A coached Add to Home Screen moment comes after the first successful plan.
4. **Safety incident in a stranger-meeting surface,** which carries the most review and press risk (repo proposal). *Mitigation:* stranger features stay off by default and inside verified boundaries (school or work), with venues limited to partner public places for first meetups. Publish the trust-and-safety one-pager. Keep 18+ enforcement. Database-enforced RLS is a selling point, so audit it externally.
5. **The cascade feels slow, or it fails hosts.** If it takes too long, hosts fall back to the group chat. *Mitigation:* response windows, a cascade preview, and smart defaults ("ask 2 at a time, 2-hour windows"). Measure time-to-full against group-chat baselines. The INNOVATIONS "Cascade Coach" idea fits here.
6. **Monetization arrives too late, as with Zenly.** *Mitigation:* sign 5 paying venues in Phase 1, even at a token price, to prove willingness to pay. The B2B revenue line protects the free consumer promise.
7. **Vanity metrics, and an IRL-style credibility gap.** *Mitigation:* report plans that happened and atomic networks retained, never registered users. Run no incentivized-install ads. The data room should show cohort charts.
8. **Positioning splits between "plans" and "meeting new people".** The pitch has to carry both, which can confuse users and investors. *Mitigation:* make friends-first planning the front door. Introduce meeting new people as "the people your friends' plans make room for" (Open Table on a friend's plan), not as a separate stranger app competing with Bumble BFF and Timeleft. The repo's one-loop story already does this. Keep the user-facing order: plan first, then meet.

### (d) Positioning statement and taglines

**Positioning statement (draft):**
For friend groups in their twenties and thirties who want to see each other more but hate being the one who asks, Switchboard is the plan-making app that makes asking safe. You invite people one at a time or in waves, decide together in private, and meet new people only when interest runs both ways. Event pages broadcast to everyone, and stranger-dinner apps start from zero. Switchboard starts with the people you already know and keeps every no private, so more plans actually happen.

**Alternative taglines:**
1. **Plans without the pressure.** (already the deck's working title, and the strongest)
2. **Ask freely. Nobody sees a no.**
3. **One invite at a time, everyone feels first.**

---

## 8. Short answers by question

- **Who is funded?** Partiful (a16z, $120M pre-money in 2022) leads friend events. Posh ($37M Series B led by FirstMark in Mar 2026, about $68M raised in total) and Luma lead public events. Pie, 222, Timeleft, Clyx and Sweatpals lead "meet strangers IRL", with seed through Series A rounds of $10M to $14M in 2024 and 2025.
- **What kills these apps?** Trust failures (spam, bots, toxicity) and having no reason to return or no revenue.
- **What works for distribution?** The invite link as the ad, guest flows with no install, a campus or community seeding density, and creators who tell an in-person story.
- **What makes money cleanly?** Venues and pro hosts. Charging per seat works only for curated stranger events.
- **Whitespace:** a friends-first, targeted, group-centric, consent-first product. Today that space belongs only to the group chat.

## 9. Verification to-do before investor use

1. Partiful 2025/2026 funding and MAU (rechecked 2026-10-17: no round after Nov 2022 found; Q1 2025 MAU of about 500K verified via Sensor Tower/CNBC).
2. Any Luma round after 2020 (still none found), and the current Luma Plus price and fee (verified: 5% free-plan fee; Plus about $59/mo billed annually).
3. Timeleft's Series A and ARR, from a primary source (still open after recheck).
4. 222's Series A press release (aggregators agree on $10.1M, 2025-12-23; no primary release). Posh Series B verified via Fortune.
5. Done: Saturn acquisition confirmed 2025-06-20; Apple Invites launched 2025-02-03.
6. Done, with corrections (see section 3.2). Still worth pulling the 2024 ACS household-size table directly.
7. Path, Yik Yak, Foursquare City Guide and the Pew teen figure are now verified (Path corrected). Still [K]: Hey! VINA, Patook, Friended, Facebook Events/Local app retirement.
8. Done: App Clip limits corrected; iOS 26 opens every Home Screen site as a web app by default.
9. Primary a16z or General Catalyst essays that use "loneliness" or "IRL renaissance" framing, if any exist.

## Verification pass 2026-10-17

About 57 web searches; WebFetch failed with DNS errors again, so checks rely on search snippets. Changes:

**Corrected ([V-corrected])**
- Path: the FTC's $800K penalty (Feb 2013) was for COPPA violations, not address-book uploads; the address-book charge was a deception count with no fine. Closure dates now verified (announced 2018-09-17, shut 2018-10-18).
- Saturn: Snap acquisition dated 2025-06-20 (was "mid-2025 [K]"); Snap says about 80% of US high schools.
- Utah median age: 32.4 (Census Vintage 2024), not "31 to 32".
- Enrollments (fall 2025): U of U 38,261 (not about 35K), UVU 48,670 (not about 45K), BYU 37,205 (not about 35K), SLCC 31,473.
- LDS share: "42% by Tribune analyses" replaced with the definitional spread: 42% self-identified (2023 academic study), about 50% (Pew 2023-24), about 64% (church rolls). Salt Lake County 49% is a church-roll figure.
- App Clips: 15MB (iOS 16+) and 100MB for iOS 17+ digital-invocation-only clips.

**Confirmed and upgraded to [V]**
- Posh $37M Series B, 2026-03-19, led by FirstMark (was [U]); Fortune revenue and GMV figures added.
- Bending Spoons / Eventbrite: about $500M cash, $4.50 a share, completed 2026-03-10 per Bending Spoons' SEC 6-K. Bending Spoons has an F-1/A on file.
- 222 Series A $10.1M dated 2025-12-23 (aggregator-confirmed only).
- Partiful Q1 2025 MAU (about 500K, Sensor Tower via CNBC); no post-2022 round exists in CB Insights or Tracxn.
- Geneva price ($17.0M cash, closed 2024-07-01, Bumble 10-Q); Bumble 30% layoff (8-K, 2025-06-25).
- Apple Invites launch facts; Surgeon General advisory (15-cigarettes figure flagged as contested).
- Foursquare City Guide shutdown 2024-12-15; Yik Yak timeline; Houseparty shutdown timeline; Zenly announcement date; Pew teen Facebook 32% (2024).
- Utah: household size largest in nation; JEC social capital No. 1; No. 1 in formal volunteering (46.6%, 2023); metro population about 1.30M; 2034 Olympics awarded 2024-07-24.
- Luma 5% fee and Luma Plus about $59/mo billed annually.
- iOS web push since 16.4, EU reversal, plus a new fact: iOS 26 opens every Home Screen site as a web app by default.

**Caveats added**
- Appfigures $16M / 4.3M figure is 2025 year to date; the TechCrunch URL date (2026-04-05) reflects a republish, so do not cite it as 2026 data.
- IRL: the 95% bot figure is a board-investigation finding the founders dispute; phrase it that way.

**Still unconfirmed after recheck**
- Timeleft $7M Series A and €18M ARR (aggregators only, no primary source, no date); Timeleft city and dinner counts vary by date.
- Any Luma round after the 2020 seed; Partiful TIME100 2025 listing; Eventbrite Flex plan retirement and new Pro prices; Pie's later 300K-user figure.

