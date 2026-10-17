> **Research memo, 2026-10-17.** Point-in-time evidence behind [`../LANDSCAPE.md`](../LANDSCAPE.md). Claims carry their verification tags; product truth lives in `src/lib/features.ts`. Do not update this file as the product changes; update `LANDSCAPE.md`.

# C. Interest-based groups and community platforms: competitive memo for Switchboard

Prepared 2026-10-17. Segment: Meetup, Facebook Groups/Events, Discord, Geneva (now Bumble BFF), Heylo, Nextdoor, Strava clubs and the run-club boom, plus lighter coverage of Peanut, Fizz, Eventbrite, WhatsApp Communities, Instagram, Partiful/Luma for recurring groups, and third-place businesses.

## Method and confidence

- Evidence tags: **[V]** means the claim was confirmed in a web search this session, and the URL is inline. **[BG]** means it comes from background knowledge (training data, cutoff mid-2026) and could not be re-checked this session. Check every [BG] figure before it goes into a pitch, a deck or product copy. **[V-corrected]** (added in the 2026-10-17 verification pass) means the original claim was wrong or imprecise and now carries the corrected text and a URL.
- Research limits: WebFetch could not resolve any host (every fetch returned `getaddrinfo ENOTFOUND`). The shared web-search budget for this turn ran out after about 30 queries. Because of that, the Meetup, Facebook, Geneva/Bumble, Heylo and Discord sections are well sourced. Nextdoor, Strava, Peanut, Fizz, WhatsApp, Instagram, and the social-club material rest mostly on [BG].
- Quotes: copy marked "quoted" is either a search excerpt of a primary page or a well-known [BG] string. No primary page could be opened to check the exact wording.

---

## 1. Meetup: the reference case for organizer economics

### History, ownership and monetization (the arc matters more than any single feature)

- **Founding thesis.** Scott Heiferman and Brendan McGovern founded Meetup in June 2002 (https://meetup.com/media). In a 2011 member letter, Heiferman tied the idea to 9/11, when neighbors started talking to each other: "Could we use the internet to get off the internet, and grow local communities?" He added that "we launched Meetup 9 months after 9/11" [V] (https://www.govloop.com/community/blog/can-we-use-the-internet-to-get-off-the-internet-and-grow-local-communities, https://alt.alexanderrea.com/2011/09/10/letter-from-scott-heiferman-of-meetup/).
- **2005: the first fee shock.** In April 2005 Meetup stopped hosting groups for free and began charging organizers $19/month (https://news.slashdot.org/story/05/04/13/0359253/meetupcom-ends-free-meetups) [V]. This set the model for the next 20 years: **the host pays and members are free.** By 2009 Meetup was profitable on roughly $9M in revenue, according to leaked shareholder documents (https://techcrunch.com/2009/09/15/leaked-shareholder-docs-meetup-hits-profitability-and-9-million-in-revenues) [V].
- **2011 redesign revolt.** Organizers protested a redesign that changed layout and permissions, using #newmeetup and #meetuporganizersunite (https://techcrunch.com/2011/01/29/meetup-feels-the-wrath-of-the-crowd-after-radical-changes-2) [V]. The lesson: organizers treat the group page as their own, and a redesign that changes their controls feels like eviction.
- **2014 Contributions** let groups collect donations (https://techcrunch.com/2014/11/05/meetup-gets-into-crowdfunding-with-launch-of-contributions) [V]. **2015 Meetup Pro** targeted brands and companies running networks of groups (https://techcrunch.com/2015/05/19/meetup-targets-businesses-and-corporations-with-launch-of-meetup-pro) [V].
- **2017 WeWork.** WeWork bought Meetup for about $156M (https://fortune.com/2020/03/30/softbank-wework-meetup-alleycorp-acquisition) [V].
- **Oct 2019 $2 RSVP fee test.** Meetup announced that "members of select groups will be charged a small fee to reserve their spot at events" and lowered organizer fees at the same time. One free coding nonprofit calculated a 1,210% cost increase. CEO David Siegel apologized for "alarm and confusion", and Meetup said the test covered a few hundred groups in two states with an opt-out (https://www.theregister.com/2019/10/15/meetup_fee_increase_backlash, https://www.forbes.com/sites/rachelsandler/2019/10/15/meetup-users-revolt-against-2-event-feeand-blame-wework/, https://wptavern.com/meetup-com-introduces-rsvp-fees-for-members-wordpress-meetup-groups-unaffected-by-pricing-changes) [V]. Tech groups started looking at alternatives right away (https://technical.ly/software-development/delaware-tech-groups-meetup-alternatives-after-proposed-rsvp-fee.md) [V]. The lesson: **charging members for free events breaks the social contract.** Organizers had promised their members "free", so the platform was spending the organizers' credibility.
- **Mar 2020 AlleyCorp.** WeWork sold Meetup to an AlleyCorp-led group (Kevin Ryan) for "a fraction" of $156M. At the time Meetup had 49M registered members and more than 230,000 organizers (https://techcrunch.com/2020/03/30/wework-sells-off-social-network-meetup-to-alleycorp-and-other-investors, https://fortune.com/2020/03/30/softbank-wework-meetup-alleycorp-acquisition) [V].
- **Jan 2024 Bending Spoons.** The Milan-based acquirer signed the deal on January 5, 2024 and announced it in "A New Home for Meetup" (https://meetup.com/blog/a-new-home-for-meetup) [V]. Layoffs and a move of operations to Europe followed. CEO Luca Ferrari wrote: "The layoff decision was not made lightly" (https://www.siliconrepublic.com/?p=1066743) [V]. Bending Spoons' known playbook (Evernote, WeTransfer, Vimeo, Komoot) is deep staff cuts plus price increases (https://ftm.eu/articles/wetransfer-owner-buys-up-apps-then-makes-them-more-expensive, https://techcrunch.com/2024/09/08/bending-spoons-plans-to-lay-off-75-of-wetransfer-staff-after-acquisition) [V]. Bending Spoons also agreed to buy **Eventbrite** in Dec 2025 for about $500M in cash ($4.50 a share), and its own SEC 6-K says it completed the acquisition on 2026-03-10 (https://meetings.skift.com/2025/12/02/bending-spoons-to-acquire-eventbrite-in-500-million-cash-deal/, https://www.sec.gov/Archives/edgar/data/0002004711/000200471126000011/bsp_ex99-2.htm) [V]. One owner now controls the two largest legacy "find something to do" platforms.
- **June 2024 organizer price increase.** Meetup's help center confirms that "prices for Standard and new PRO organizers were increased starting June 2024." Current list prices: **Standard "starting from $29.99/month · $99.99/6 months · $174.99/year", max 3 groups. PRO "starting from $55/group/month" ($47 on a 6-month term)**, with prices that "can vary by location" (https://help.meetup.com/hc/en-us/articles/28677808413197-Organizer-Subscription-prices-overview) [V, reconfirmed 2026-10-17; no later official price change found]. Organizer accounts of the change: a Pro price that tripled with less than 30 days' notice (Andy Piper, Oct 18 2024: "Meetup.com is so over", https://andypiper.co.uk/2024/10/18/meetup-com-is-so-over/); a six-month plan going from $29 to $99 (https://www.settledin.eu/en/munich/using-meetup-munich-social-groups/); "fees tripled while core community features become paywalled" (https://medium.com/@hoffbits/pay-to-skip-why-meetup-risks-undermining-its-own-community-635cb1c25f9c). On Trustpilot, a 12-year organizer reports costs up about 4x, and a 14-year Drupal group dropped its subscription, saying it is "basically killing smaller groups with no income streams" (https://ca.trustpilot.com/review/meetup.com?page=10) [V, anecdotal]. Prices also look geo-varied or A/B tested: third-party pages report figures from $16.49 to $47 (https://www.rapidevelopers.com/md/clone/meetup) [V, unreliable source]. Josh Bernoff's complaint ("if you're going to change your prices, be clear about it", https://bernoff.com/blog/to-meetup-if-youre-going-to-change-your-prices-be-clear-about-it) [V] is about price opacity as much as the price itself.
- **Member-side monetization since 2024.** **Meetup+** is a member subscription billed weekly, monthly or yearly. Perks: "ad-free experience", a "Meetup+ badge", "full visibility into attendee and member details", **"priority on waitlists"**, and exemption from service fees on paid events (https://help.meetup.com/hc/en-us/sections/39489509761421--Meetup-Benefits) [V]. A UK "Member+" test priced at £3.49/month preceded it (https://www.globaldatinginsights.com/news/subscription-service-changes-coming-to-meetup-members/) [V]. Ticketed events carry a Meetup service fee, $1.62 on a $10 ticket, waived when the organizer subscribes (https://help.meetup.com/hc/en-us/articles/39489419634189-Why-does-Meetup-charge-a-service-fee-for-ticketed-events) [V]. Meetup also runs Rokt "Thanks" offers on the RSVP confirmation screen, which Rokt says produce "$78K in net profit for every 1M event RSVPs" (https://www.go.rokt.com/case-studies/meetup-partners-with-rokt-thanks-to-drive-an-additional-78k-in-profit-for-every-1m-impressions) [V]. The "Pay to Skip?" essay argues that paid waitlist priority is "monetizing fairness": a member who RSVP'd first loses the spot to a paying member, which overrides the organizer's own ordering (https://medium.com/@hoffbits/pay-to-skip-why-meetup-risks-undermining-its-own-community-635cb1c25f9c) [V, opinion].
- **2025 to 2026 product work** (the period after the cuts). A web redesign shipped in October 2025 and the mobile apps followed in December 2025 (https://www.meetup.com/blog/new-design-2025/, https://www.engadget.com/mobile/meetups-new-mobile-app-is-designed-to-make-it-easier-to-meet-people-irl-150000920.html) [V]. Changes:
  - Event pages show a **broad gender and age breakdown of who has RSVP'd**, presented as a way to help people, "particularly women, feel more confident about attending."
  - Group reviews became public.
  - Events sync to Google Calendar.
  - DMs load "5-10 times faster".
  - AI semantic search: search clicks up 10% and group joins from search up 9%.
  - The iOS Explore redesign raised RSVPs from that page by 20% (https://www.meetup.com/blog/2025-meetup-progress-report/) [V].

  The 2026 roadmap: "one shared home on Meetup. No more separate Organizer app", plus **QR-code check-ins** to "track attendance faster and more accurately, reducing confusion at the door" (https://www.meetup.com/blog/2026-meetup-roadmap/, https://www.meetup.com/blog/new-to-meetup-the-event-check-in-feature-for-organizers/) [V].

### Core loop

- **Member loop:** search or an email digest leads to a group page. The member taps "Join", which may involve organizer-written profile questions, then RSVPs to an event and can join the waitlist. After the event come reminders, a feedback prompt, photos, and the next event in the series. The unit of loyalty is the **group**, not the event, and joining a group subscribes you to every future event announcement.
- **Organizer loop:** pay the subscription, create the group (topic plus city, which generates an SEO page), schedule events (recurring events are supported), approve members, message the group, and assign co-organizers and event hosts [BG for the exact role names: Organizer, Co-organizer, Assistant Organizer, Event Organizer]. Organizers get a group that is **discoverable and has an inbound flow of strangers**, which no group chat offers.
- **What keeps organizers hosting.** Mostly intrinsic reasons: status as "the person who runs X", a social life arranged around their own interest, and, for professionals, lead generation and personal brand. The financial terms are the reverse of Uber or Etsy: **the organizer pays to supply the platform's inventory.** Once a group has 50+ engaged members, organizers recover the fee through dues or by charging a few dollars per event, which turns hosting into a small business. Hobby groups of 8 to 20 regulars have no way to recover it, and these are the groups that died in 2024 to 2025 (Trustpilot and Drupal accounts above).

### Retention mechanics

- **Recurring events and series:** the standing weekly "Tuesday trivia" is the backbone of most successful groups.
- **RSVP limits, waitlist and guests:** auto-promotion from the waitlist creates scarcity and a reason to RSVP early.
- **Attendance marking** lets organizers record no-shows, and some groups remove repeat no-shows [BG]. QR check-in (2026) makes attendance data reliable, which matters if Meetup ever ranks or prices by attendance.
- **Reviews and feedback:** "Viewing event feedback from members" (https://help.meetup.com/hc/en-us/articles/360013054151-Viewing-event-feedback-from-members) [V].
- **No-shows:** for free community meetups, no-show rates of about 35 to 50% are normal. One Meetup organizer reports "averages 40 percent" (https://www.linkedin.com/pulse/managing-no-shows-your-meetups-networking-events-sarah-reichardt) [V, anecdotal]. Benchmarks put community events at 55 to 65% attendance and show paid events with lower no-shows (https://venuera.com/event-no-show-rates-by-event-type/, https://www.nunify.com/blogs/event-attendance-rate) [V, vendor data].
- **"Members" as a vanity metric:** one public example, the Gemini Meetup group, reported 8,317 members and 7,288 RSVPs across 34 events in 2025, with a largest event of 283 RSVPs (https://2025.geminimeetup.ai/) [V]. Fewer than 3% of members show up to a typical event.

### Psychology

- **Identity via interest** lowers the stakes of meeting strangers. You are there for the board games, not to "make friends", which spares newcomers from admitting they are lonely.
- **The regulars effect is what creates value.** Forum organizers say a group needs "a strong core of regulars to establish a safe/inclusive environment for newbies and offload the event organizing work so the head doesn't burnout" (https://news.ycombinator.com/item?id=10891179) [V].
- **Leader dependence is the failure point.** An academic study of Meetup found that event-based social networks "are usually leadership-focused, and losing the leader is often the direct cause of the collapse of Meetup groups unless some members take the rein" (https://www.researchgate.net/publication/317595581_Going_Online_to_Meet_Offline_Organizational_Practices_of_Social_Activities_through_Meetup) [V].
- **Newcomer anxiety:** the 2025 gender and age breakdown is Meetup's direct product response to "who will be there?" anxiety.

### Design language and voice

- Homepage line (2022 to 2025): "The people platform. Where interests become friendships." [BG]. The tone is warm and generic, with an outline-illustration style.
- Help-center copy is plain, transactional and fee-heavy ("This fee is collected by Meetup to help cover the costs of developing and maintaining the Meetup platform", from the service-fee article above) [V].
- The 2025 redesign moved to "updated fonts, brighter icons, and tighter spacing" (Engadget, above) [V].

### Growth

- **SEO is the moat.** Every group generates an indexable page by topic and city, and topic pages aggregate them (for example "19,663 members, 23 groups" for one US topic) (https://meetup.com/topics/search-engines/us) [V]. Semrush estimated 11.79M visits to meetup.com in May 2025 (https://cw.semrush.com/website/meetup.com/overview) [V, estimate]. Marketers describe Meetup as ranking "pretty high in some SEO terms" (https://marketingbs.substack.com/p/alex-norman-techto-part-2) [V].
- **Email digests** ("new groups near you", "events this week") are the second channel.
- The group pages that bring in strangers are the most durable asset Meetup has.

### Failure modes

- **Ghost towns.** Groups rarely close. "The page stays up, the member count stays impressive, and the events calendar just quietly stops" (https://aroundme.co/blogs/is-meetup-still-good) [V]. Coordination moves to WhatsApp or Discord while a bare Meetup listing stays up as a lead magnet (https://www.settledin.eu/en/munich/using-meetup-munich-social-groups/) [V].
- **Sales funnels:** "networking" groups run by realtors, MLMs and coaches, plus paid "singles" events [BG, widely reported].
- **Fee backlash** in 2005, 2019 and 2024. Each time, the platform taxed the scarcest participant, the organizer.
- **Notification spam** from being in many groups, which pushes members to mute everything [BG].

### Mid-sized cities

The Munich account shows the problem: many groups exist on paper and few are active (https://www.settledin.eu/en/munich/using-meetup-munich-social-groups/) [V]. Mid-sized cities have a short head of a few healthy evergreen groups (hiking, board games, language exchange, tech) and a long tail of dead groups. Paid organizer plans hurt the long tail most, and in a city the size of SLC that tail is most of the catalogue. **Implication:** in SLC, a Switchboard "circle" competes with the 5 to 15 genuinely active Meetup groups per category, not with Meetup as a brand.

---

## 2. Facebook Groups and Events

- **Scale and mission.** In 2017 Zuckerberg reframed Facebook's mission around community, cited "more than 100 million people" in "very meaningful" groups, and set a goal of 1 billion (https://www.wral.com/mark-zuckerberg-explains-why-he-just-changed-facebook-s-mission/16778575/) [V]. By 2020, about **1.8B people used Groups monthly** (https://www.searchenginejournal.com/1-8-billion-people-use-facebook-groups-every-month/397109/) [V].
- **Youth exodus.** Pew: 32% of US teens use Facebook (Sep to Oct 2024 survey), down from 71% in 2014-15 (https://www.pewresearch.org/internet/2024/12/12/teens-social-media-and-technology-2024/) [V-corrected]. Meta's Oct 2024 young-adult redesign added a **Local tab** that aggregates Marketplace, Groups, Reels and Events. It was tested in Austin, NYC, LA, DC, Chicago, Charlotte, Dallas, Houston, SF and Phoenix, **not Salt Lake City**. The redesign also added **weekly and weekend event digests** and the ability to invite Instagram followers to a Facebook event by SMS and email (https://techcrunch.com/2024/10/04/facebook-launches-a-gen-z-focused-redesign, https://www.engadget.com/social-media/facebook-is-pushing-local-content-and-events-to-try-to-win-back-young-adults-161742961.html, https://www.socialmediatoday.com/news/facebook-youth-focused-refresh/729027/) [V]. Meta also tested a Group AI that answers questions already answered in a group (https://smallbiztrends.com/new-facebook-local-features-for-creators/) [V]. I found no 2025 to 2026 data on whether Local rolled out widely.
- **Core loop.** An admin creates a group with membership questions and rules. Members post, which drives notifications to everyone else in the group. An event created inside a group inherits the group's audience. Events are "Going / Interested / Can't go" [BG], and "Interested" is a low-commitment signal that inflates apparent demand.
- **Organizer economics.** Hosting is free. The admin is unpaid moderation labor, the platform keeps all monetization (ads), and badges and "Admin Assist" are the rewards [BG]. Research on volunteer moderators of Facebook Groups and Reddit (University of Michigan, *New Media & Society*) found burnout from "too little available time", conflict with co-moderators, and daily exposure to toxicity (https://www.si.umich.edu/about-umsi/news/volunteer-content-moderators-are-likely-experience-burnout-new-study-suggests) [V].
- **What still works.** Facebook Groups remain the default infrastructure for **neighborhood "Buy Nothing" groups, parent groups, local hobby groups and mid-size-city scenes**, especially for people over 30 [BG]. In SLC, many climbing, ski-touring, church-adjacent and parent communities still run on Facebook Groups [BG; verify locally].
- **Failure modes:** an engagement-ranked feed hides event posts, so posting cadence has to beat the algorithm. Spam and scam accounts join open groups. Arguments are amplified. "Interested" counts mislead hosts. The Gen Z cohort is absent.
- **Partiful as the anti-Facebook.** Partiful positioned itself as "Facebook Events for hot people" (https://nogood.io/blog/partiful-marketing-strategy/) [V]. It averaged about 500K MAU in Q1 2025, up 400% year over year, against Eventbrite's 4.4M MAU, up 2% (Sensor Tower via CNBC: https://www.nbcconnecticut.com/news/business/money-report/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple/3547391/) [V]. Sacra links Partiful's campus growth to Facebook Events' decline among Gen Z and Greek life (https://sacra.com/research/partiful) [V].

---

## 3. Discord for IRL communities

- **Role.** Discord is the **chat layer** of many IRL scenes (run crews, climbing partners, board-game nights, tech meetups), while RSVPs and tickets sit elsewhere. One example: a chief-of-staff network runs its IRL events through Luma and uses Discord only for the community around them (https://davidnebinski.substack.com/p/building-irl-community-remotely) [V]. City and "IRL" servers exist ("local servers that host regular events… coffee, food crawls, photo walks, run clubs") (https://discordhome.com/servers/tag/irl, https://disboard.org/servers/tag/local?sort=-member_count) [V].
- **Native events are thin.** Scheduled Events (2021) have topic, time, frequency and an **"Interested"** button with automatic reminders. There is no native yes/no/maybe or waitlist, which bots like Apollo fill (https://www.howtogeek.com/757782/discord-will-finally-let-you-schedule-server-events/, https://apollo.fyi/, https://support.discord.com/hc/en-us/community/posts/360057956112-Server-Calendars-RSVP-Idea) [V].
- **Organizer economics.** Free. Status comes from role colors, mod titles and channel ownership. Burnout comes from moderation load, as with Facebook.
- **Psychology.** Persistent channels create **ambient co-presence**: you see the regulars talking daily, which supplies the mere-exposure effect between meetups. The downsides are a high learning curve and a gamer-coded design, so newcomers to an IRL server see 40 channels and freeze. Recommended structure: a read-only announcements channel plus an events channel (https://commonslibrary.org/ecda-how-to-use-discord-a-guide-for-progressive-organizers-parties-movements/) [V].
- **Business:** Nitro subscriptions and server boosts [BG]. Discord says it has 200M+ MAU (company statement, not audited) and confidentially filed for a US IPO, reported by Bloomberg on 2026-01-06 with Goldman Sachs and JPMorgan; no public S-1 or listing found as of Oct 2026. Last private valuation about $15B (2021) (https://www.storyboard18.com/social-media/discord-files-confidentially-for-ipo-reports-87132.htm, https://forgeglobal.com/insights/discord-upcoming-ipo-news/) [V for the filing report; U for current status].

---

## 4. Geneva (now Bumble BFF) and Heylo: "group home" apps

**Geneva** was a free group chat and community app for clubs, with rooms for chat, posts, audio, video and events [BG for the feature list]. Bumble announced the acquisition in May 2024 and closed it on 2024-07-01 for about $17.0M in cash (https://www.businesswire.com/news/home/20240519753736/en, https://www.sec.gov/Archives/edgar/data/1830043/000095017024093910/bmbl-20240630.htm) [V]. In its Q2 2025 10-Q, Bumble disclosed that **Geneva had generated no revenue** as of June 30, 2025 (https://www.sec.gov/Archives/edgar/data/1830043/000162828025038861/bmbl-20250630.htm) [V]. In Sept 2025 Bumble relaunched **BFF**, "powered in part by" Geneva, with chat rooms, hangout planning, an in-app calendar, and the Groups tab as the focus. One-to-one friend matching stayed. Geneva shut down and its members were moved to BFF "without losing any of their groups or messages" (https://techcrunch.com/2025/09/18/bumble-bffs-revamped-app-is-here-focusing-on-friend-groups-and-community-building, https://wersm.com/?p=115319) [V]. A secondary source says **group discovery did not ship until February 2026** [V, single secondary source]. Datingnews calls the trend the "friennaissance" (https://www.datingnews.com/apps-and-sites/bumbles-friendship-app-redefines-growth-beyond-dating-with-the-friennaissance/) [V].

**Lessons from Geneva:**
- A tool for existing groups, with no discovery and no revenue, struggles to stand alone. Its value went to a company that had the discovery side (Bumble's matching).
- Combining **1:1 matching with groups** is the direction the market moved in 2025 to 2026. That is Switchboard's territory (mutual interest plus circles).

**Heylo** is the organizer-first, payments-led version. Recurring events auto-schedule ("the date automatically updates per the recommended frequency"). Organizers can run one-time or recurring dues, free trials and tiered registrations, with payouts sent to a bank account automatically (https://www.heylo.com/help/payments) [V]. Pricing: a platform fee of about 2% + $0.29 per transaction, or 1% + $0.10 on the "Business" plan at $199/month per group (https://wf.heylo.com/pricing) [V, tier mapping unclear]. Heylo raised a $1.5M seed in Oct 2022 (Precursor, Worklife) (https://www.preqin.com/data/profile/asset/heylo/515651) [V], and says it has helped leaders "collect over $3M" (https://www.heylo.com/help/payments) [V]. Its positioning is "Build a stronger community" (https://heylo.com/) [V]. **The lesson is the reverse of Meetup's:** Heylo is free until the organizer earns, then takes a cut. That aligns the platform with organizer success, but it pulls the product toward paid clubs (sports leagues, run clubs with dues) and away from casual friend circles.

---

## 5. Nextdoor (neighborhood boards) [mostly BG]

- **Model:** address-verified neighborhoods, a feed of posts (recommendations, lost pets, crime, for-sale), groups and events. Revenue is local and national advertising. The company went public via SPAC in Nov 2021 and has been persistently unprofitable [BG, unconfirmed after recheck]. **Platform weekly actives were 21.6M in Q3 2025 and about 22.9M in Q2 2026, against roughly 100M registered users**, not the 40M+ previously stated (https://www.aol.com/articles/nextdoor-nxdr-q3-2025-earnings-231854451.html, https://www.axios.com/2025/07/15/nextdoor-app-ai-reboot) [V-corrected]. The Jul 2025 relaunch rebuilt the app around News (3,500 local publishers), Alerts and Faves (AI-surfaced recommendations) (https://techcrunch.com/2025/07/15/nextdoor-redesigns-app-with-ai-recommendations-local-news-and-real-time-emergency-alerts) [V].
- **Psychology:** proximity (Festinger's Westgate study: friendship tracks physical distance) and civic identity. In practice the feed's emotional center became **fear and complaint**: crime posts, "suspicious person" posts, and arguments about parking.
- **Design response:** after racial-profiling criticism in 2015 to 2016, Nextdoor added friction to crime posts (required descriptors beyond race) and a **"Kindness Reminder"** that fires when a reply looks hostile [BG; widely reported]. The mission line is "to cultivate a kinder world where everyone has a neighborhood they can rely on" [BG].
- **Lessons for Switchboard's neighborhood boards:**
  1. An open text feed scoped by geography drifts toward complaints and safety alarms unless the post types are constrained.
  2. Verification increases trust and also invites surveillance behavior.
  3. Nextdoor Events and Groups never became the main use case. Boards need a narrow "do something together" purpose, such as "I'm going to X Saturday, join?", rather than general discussion.

---

## 6. Strava clubs and the run-club boom [headline figures V; mechanics BG]

- **Phenomenon:** from 2023 to 2025, run clubs became a primary way for people in their 20s and 30s to meet other people, widely called "the new dating app" in the press. Strava's 2024 Year in Sport report cited a **59% rise in running-club participation** and an 18% rise in group runs of 10+ people, from Strava data plus a 5,000-person survey (https://marathonhandbook.com/strava-2024-year-in-sport-report/, https://gearjunkie.com/endurance/strava-year-in-sport-trend-report-2024) [V]. The 2025 report says new clubs almost quadrupled, to about 1M clubs in total, with running clubs up about 3.5-fold (https://www.bikeradar.com/news/strava-year-in-sport-2025, https://www.bike-magazin.de/en/training/fitness/strava-s-2025-annual-report-specialized-is-the-number-1-biker/) [V for the all-club figure; U for the run-club multiple, secondary source]. Strava raised at a **$2.2B valuation (including debt) in May 2025, led by Sequoia**, bought Runna and The Breakaway in Apr 2025, and confidentially submitted an IPO draft registration in early 2026; no pricing or listing found as of Oct 2026 (https://sgbonline.com/strava-nets-2-2-billion-valuation-in-funding-round/, https://fortune.com/2026/01/13/how-strava-ran-toward-a-comeback-ipo/, https://forgeglobal.com/insights/strava-upcoming-ipo-news/) [V].
- **Why run clubs work (transferable mechanics):**
  - **Fixed time and place, forever.** "Thursdays 6:30pm, from the coffee shop." No poll, no RSVP needed, and you can come once a month and still belong.
  - **The activity is the excuse.** Side-by-side movement lowers eye-contact pressure, and conversation is optional.
  - **Pace groups** sort people into small groups of 4 to 10 inside a crowd of 100, which handles newcomer anxiety.
  - **A built-in after-ritual** (coffee or beer) where the actual socializing happens.
  - **Low cost:** free, which removes the no-show guilt problem. No-shows do not matter at an open-door event.
  - **Host economics:** brands (running shoes, apparel, coffee shops, breweries) pay or supply product to clubs with large Instagram followings, and the venue gets 50+ customers on a weeknight. Run clubs became a marketing channel, so **hosts get paid in status, product and venue relationships** [BG].
- **Strava clubs as software:** a club page, member list, club posts, club events with routes, and leaderboards. The activity feed passively shows that "Jess ran with the club this morning", a **visible-attendance signal** that recruits peers [BG].
- **Organizing stack:** most run clubs announce on **Instagram** (a weekly route post, Stories, broadcast channels), coordinate on WhatsApp or GroupMe, and log on Strava. Nobody needs an RSVP for an open run.
- **SLC relevance:** the Wasatch Front is a strong outdoor-activity market (trail running, climbing, skiing) [BG]. Run, climb and ski clubs are likely Switchboard's best wedge communities for standing rituals.

---

## 7. Lighter coverage

- **Peanut (moms)** [BG]: launched Feb 2017 as a "Tinder-like app for making new mom friends" (https://techcrunch.com/2017/02/09/peanut-is-a-tinder-like-app-for-making-new-mom-friends) [V for launch], founded by Michelle Kennedy (ex-Badoo) [BG]. Swipe matching for moms by life stage and location, then "Groups" and "Pages" for discussion, later expanded to fertility and menopause. **Lessons:** life-stage identity is a stronger social key than interest. Matching followed by group gatherings works when the shared constraint (nap schedules, strollers) is concrete.
- **Fizz and campus apps**: Fizz is an anonymous, campus-verified feed with student moderators, later adding a marketplace [BG]. It was founded at Stanford in late 2020 by Teddy Solomon and Ashton Cofer and launched there in Jul 2021; it raised a $4.5M seed and a $12M Series A in 2022 and reportedly about $41M in total by 2025 (https://stanforddaily.com/2022/12/04/fizz-receives-12-million-in-series-a-funding/, https://finder.techleap.nl/news/feed/fizz-raises-41m-for-gen-z-app) [V-corrected]. **Lessons:** a closed, verified community plus anonymity gets high engagement and high moderation risk. Anonymity works for *signals* (polls, "who's down") far better than for open text. This supports Switchboard's private anonymous polls and argues against anonymous free-text boards.
- **Bumble BFF:** see section 4. Groups became the focus in Sept 2025.
- **Eventbrite communities:** ticket-first, with organizer "followers" and collections. Owned by Bending Spoons since the deal closed on 2026-03-10 (agreed Dec 2025), so expect the Meetup playbook (fees up, staff down) [V for ownership; BG implication; reports of post-close staff cuts and plan changes come from competitor blogs, unconfirmed after recheck]. Eventbrite's MAU is flat (4.4M, +2%, Q1 2025, per the CNBC link above) [V].
- **Luma** is the current organizer favorite for tech and creative scenes. Free to create events, a 5% fee on paid tickets (removed with Luma Plus, about $59/mo billed annually, https://help.luma.com/p/luma-plus-overview [V, reconfirmed]), and **Calendars**, which let people subscribe to a host or community and get each new event (https://help.luma.com/p/luma-vs-meetup) [V for pricing; BG for Calendars]. Its own comparison concedes that Meetup may fit groups that need "built-in member directories" [V]. Luma Calendars are the closest analogue to a "standing ritual feed".
- **WhatsApp Communities**: launched Nov 2022 as an umbrella over sub-groups plus an admin-only announcement group [BG] (unconfirmed after recheck). Events were added to Communities on 2024-05-01, with replies to announcements, and then rolled out to all groups (https://blog.whatsapp.com/new-to-communities-events-and-replies-in-announcement-groups) [V]. WhatsApp is where most groups actually live after a Meetup or Facebook start, because everyone already has it, notifications get attention, and it is free. Weaknesses: no discovery, no newcomer path, no memory of who came, and chat volume that buries plans.
- **Instagram broadcast channels and Close Friends**: broadcast channels launched on 2023-02-16 as a one-to-many feed, announced by Zuckerberg and expanded globally in mid-2023 (https://techcrunch.com/?p=2487019, https://www.iphoneincanada.ca/2023/02/16/instagram-launches-new-channels-feature-for-broadcasting-messages/) [V]. The uses below are [BG]. Run clubs, supper clubs and party hosts use the grid, Stories and broadcast channels as their **public storefront and recruitment funnel**. Close Friends serves as an informal "inner circle" invite list. **Lesson:** hosts want to stay where their audience already is, so Switchboard should export to Instagram (share cards, link in bio) rather than ask hosts to move.
- **Partiful and Luma for recurring groups** [BG]: hosts of weekly dinners or monthly book clubs duplicate the previous event and re-blast the same guest list. Partiful's "mutuals" and guest list visibility answer "who's going". The workaround shows unmet demand for **series with a stable roster**, which is Switchboard's standing rituals.

---

## 8. Third places and social clubs (product implications only)

- **Oldenburg's third place** (*The Great Good Place*, 1989) [BG]: neutral ground, conversation as the main activity, accessible hours, **"the regulars"** who set the tone, low profile, playful mood, home away from home. A third place works because you can **show up without an invitation** and expect to see familiar faces.
- **Membership social clubs** (Soho House and its many imitators) [BG]: curation and scarcity (application, waitlist, fees), a physical space, and programming. Soho House's financial struggles and its take-private (agreed Aug 2025 at $9 a share, about $2.7B enterprise value, led by MCR; financing had to be restructured in early 2026; reported completed and delisted from the NYSE) (https://www.hollywoodreporter.com/business/business-news/soho-house-take-private-deal-ashton-kutcher-board-1236347615, https://www.thecaterer.com/all-content/soho-house-completes-2b-take-private-deal) [V-corrected: the deal was signed in 2025 but closed in 2026] show that physical clubs are expensive, while the *mechanics* (vetting, a sense of "people like me", programming calendars, member hosts) can be copied in software.
- **Climbing gyms** [BG]: the regulars effect in its purest form. The same people come at the same times, bouldering is naturally social (working on a problem together), and gyms run weekly socials and ladies' nights. SLC has a dense climbing-gym scene.
- **Product implications:**
  1. "Drop-in" ritual events with no RSVP required.
  2. Show "usually here" regulars.
  3. Venues as hosts: a coffee shop or gym can sponsor a standing ritual.
  4. Light vetting for Open Table (friends-of-friends) gives club-like trust without fees.

---

## 9. Cross-cutting psychology (for design decisions) [BG unless linked]

- **Mere exposure and propinquity** (Zajonc 1968; Festinger, Schachter and Back 1950): liking grows with repeated, low-stakes contact. Recurring fixed events beat one-off "big" events.
- **Hours to friendship** (Jeffrey Hall, *Journal of Social and Personal Relationships*, published online Mar 2018; print issue 2019; https://news.ku.edu/2018/03/06/study-reveals-number-hours-it-takes-make-friend) [V-corrected date]: roughly 50 hours of time together to become a casual friend, about 90 for a friend, and 200+ for a close friend. Only recurrence reaches those numbers. A weekly 2-hour ritual gets a group to casual friendship in about 6 months.
- **Mario Small, *Unanticipated Gains*:** ties form as a side effect of institutional routines (mothers at the same childcare center), not through deliberate networking. Standing rituals and circles should feel like routine, not "making friends".
- **The liking gap** (Boothby et al., 2018): people underestimate how much others liked them after a conversation, which suppresses follow-ups. Mutual-interest matching ("they'd like to see you again too") speaks to this directly.
- **Newcomer anxiety:** "Will I know anyone? Will I be the only one?" Remedies that work: a named greeter, small subgroups (pace groups), visible composition (Meetup's age and gender breakdown), and "first-timer" tags.
- **Organizer burnout:** the 90-9-1 participation pattern means one person carries the group. The fix is **distributed hosting** (rotation, co-hosts, "step up" when the host leaves) and lowering the cost of each event to near zero (auto-repeat, auto-reminders, no poll needed).

---

## 10. Mid-sized city (Salt Lake City) synthesis

- **Density needs differ by format.**
  - Interest-group discovery (Meetup style) needs a large pool per niche. In a market of about 1.22M (Salt Lake County) to 1.30M (the Salt Lake City metro, Census July 2024 estimates, https://usafacts.org/answers/how-many-people-live-in-the-us/metro-area/salt-lake-city-ut/ [V]), or about 2.7M for the whole Wasatch Front [BG, unconfirmed after recheck], niche groups stall at 5 to 15 regulars.
  - Friend-graph formats (cascading invites, Open Table) need **graph density, not population**, and work from day one inside existing social clusters.
  - Neighborhood boards need about 5 to 10% household penetration per neighborhood before posts get replies [BG heuristic].
- **Platform performance outside the big coastal metros:** Meta tested Local only in large metros, Partiful skews to NYC and SF and campuses, and Meetup's 2024 fees hollowed out small-city long tails. **Mid-sized cities are under-served by every incumbent**, which is an opening, but also a cold-start risk.
- **SLC specifics** [BG; verify locally]:
  - A large transplant inflow (tech, the University of Utah, the outdoor industry) creates many people without a network.
  - The LDS ward system is already a "circle with assigned hosts" (ministering, callings, weekly activities). Many non-members and post-members want a secular equivalent, a real market.
  - Outdoor seasonality (ski winter, trail summer) suggests rituals that shift with the seasons.
  - Strong run-club, climbing and coffee cultures make good wedge communities.

---

## (a) The 10 most transferable lessons for Switchboard

1. **The host is the scarcest resource. Never tax them, and pay them in status.** Meetup's three fee crises (2005, 2019, 2024) all came from charging the people who create the inventory. Keep hosting free forever. If Switchboard monetizes, charge members for optional conveniences, or charge venues and brands that sponsor rituals, never in ways that override host decisions. (Meetup+ "priority on waitlists" is the anti-pattern: it lets money override the host's own fairness rules.)
2. **Standing rituals beat events.** Run clubs, trivia nights and climbing nights succeed because of a fixed time and place with no RSVP needed. Rituals should default to "happens unless cancelled", auto-generate the next occurrence (as Heylo's recurring events do), and treat RSVP as optional ("I'm in this week" rather than a required commitment).
3. **Design for the regulars, then for newcomers.** Show a quiet "usually there" roster for a ritual (opt-in) and mark first-timers so regulars can welcome them. The 2026 Meetup roadmap's attendance check-in shows the industry values reliable attendance data. Switchboard can use it privately to drive a "regulars" signal instead of public leaderboards.
4. **Leader loss kills groups, so build succession in.** Each circle or ritual should have co-hosts by default and a "pass the ritual" flow. When a host goes quiet (no occurrence confirmed for N weeks), prompt the regulars to step up instead of letting the page ghost.
5. **Ghost towns are worse than nothing.** Meetup's pages "stay up" with impressive member counts and nothing on the calendar. Switchboard should auto-archive dormant circles and boards and show **activity recency** ("met 3 times this month"), not member counts.
6. **Answer "who will be there?" before asking for commitment.** Meetup's 2025 age and gender breakdown and Partiful's guest list both exist for this reason. Switchboard's cascading invites and Open Table should show anonymized composition or mutual friends ("2 people you know, 4 friends-of-friends") before the yes.
7. **Small inside big.** Pace groups at run clubs and tables at supper clubs: large open events need sub-structure. Open Table and serendipity zones should create groups of 4 to 8, not crowds.
8. **Anonymity for signals, not speech.** Fizz and Nextdoor show that open anonymous or geo text feeds drift toward complaints, fear or toxicity. Keep anonymity to polls and mutual-interest signals, which Switchboard already does. Keep neighborhood boards on structured post types ("going to X, join?", "lend/borrow", "standing invite") with kindness friction like Nextdoor's.
9. **Meet hosts where their audience is.** Run clubs live on Instagram, groups chat on WhatsApp, and tech scenes use Luma plus Discord. Switchboard should be the **coordination and memory layer** (who came, what's next, who's a regular) with excellent share-outs (OG cards, calendar subscribe, a link-in-bio page per ritual). It should not try to replace the chat app.
10. **Discovery for rituals is local SEO.** Meetup's lasting asset is indexable "topic + city" pages. Public rituals and Open Table plans, where the host opts in, could get indexable SLC pages ("Thursday trail run, Sugar House") that bring in strangers. Keep private circles strictly private.

## (b) Five traps

1. **Paywalling fairness or social signals** (priority waitlists, seeing who's going, member details). Meetup+ made the RSVP list a premium feature, which turns the social layer into a sales funnel and makes non-payers feel second-class.
2. **Vanity membership metrics.** "8,317 members" against fewer than 300 at the biggest event. Counting joins instead of repeat attendance hides the decay until the group is dead.
3. **Becoming a chat app.** Geneva generated no revenue and was absorbed into Bumble. Discord is overwhelming for IRL newcomers. Chat volume buries plans. Plan rooms should stay tied to a plan and expire or settle afterwards.
4. **Open geo-feeds without structure.** The Nextdoor trap: neighborhood boards become complaint, crime and argument boards. MLM, "networking" sales pitches and promoters will also target any public board or Open Table. Rate-limit and report them, and require real plan structure.
5. **Notification spam as growth.** Facebook's digests and Meetup's group emails train people to mute. For a "less pressure" product, notification restraint is the brand: batch, use quiet hours, and send at most one nudge per ritual per week.

## (c) A host flywheel Switchboard could adopt

**Stage 0. Make hosting nearly free.** Anyone can turn a plan into a standing ritual in one tap ("Make this weekly"). Switchboard handles the schedule, reminders, the weather or venue fallback, and the "still on?" check. The host's per-occurrence work drops from about 30 minutes of chat herding to one tap.

**Stage 1. Fill the first room from the host's own graph.** Cascading invites go to the host's circle, then friends-of-friends through Open Table if the host opts in. Show composition before commitment. Target: 4 or more people at occurrence one, since the run-club pace-group lesson says 4 is enough to feel real.

**Stage 2. Turn attendees into regulars.** Track private attendance (with check-in or a "I went" confirmation). After two or three attendances a person becomes a "regular" (visible only inside the ritual). Regulars get one-tap "bring a friend" invites, so each regular becomes a recruiter. Mutual-interest matching runs quietly among co-attendees ("you and Sam both want to grab coffee after"), which converts ritual exposure into friendships. This is the hours-to-friendship engine.

**Stage 3. Turn regulars into co-hosts.** At about 3 regulars, prompt the host: "Want a co-host so it runs when you're away?" A co-host can confirm or cancel an occurrence. When the host is quiet for 2 cycles, the regulars get a "keep it going" prompt (succession). Hosting status is rewarded socially through a quiet "Host since March, 24 gatherings" line on the host's profile and a thank-you summary after each season, not through points or streak pressure.

**Stage 4. Let healthy rituals recruit strangers.** A ritual with sustained attendance (for example 6+ occurrences and 5+ regulars) and host opt-in becomes eligible for public discovery: an SLC events and serendipity-zone listing, an indexable page, and venue partnership. Newcomers arrive and become regulars (back to Stage 2), and some newcomers start their own rituals (back to Stage 0).

**Stage 5. Pay hosts in the currency they value.** Venues and brands sponsor rituals (the run-club model): a free first coffee, a reserved table, a discount for regulars. The money goes to the experience, never to a host fee or to priority access. Optionally, hosts can collect dues through Switchboard with a small cut (the Heylo model) only if the group asks for it.

**The flywheel's loop:** lower hosting cost leads to more rituals. More rituals mean more repeat exposure, which produces more regulars and friendships. More regulars create more co-hosts and resilience, plus more invites. More invites bring more newcomers, and some newcomers become hosts. **Metrics to watch:**
- Rituals with 4 or more occurrences
- Share of attendees who return within 3 occurrences
- Rituals that survive a host absence
- New hosts who first attended someone else's ritual

None of these is member count or DAU.

## Verification pass 2026-10-17

About 57 web searches shared with the F memo; WebFetch still failed with DNS errors, so checks rely on search snippets. Changes in this memo:

**Corrected ([V-corrected])**
- Nextdoor weekly actives: about 21.6M (Q3 2025) to 22.9M (Q2 2026), not "40M+". The Jul 2025 relaunch (News, Alerts, Faves) is now sourced.
- Pew teen Facebook use: 32% in the 2024 survey (was "33%"), baseline 71% in 2014-15.
- Soho House take-private: signed Aug 2025 but closed in 2026 after a financing restructure (was "2025 take-private deal").
- Hall hours-to-friendship study: published online Mar 2018 (print 2019), not simply "2019".
- Fizz: founded late 2020 at Stanford, launched Jul 2021; funding history added.

**Confirmed and upgraded to [V]**
- Bending Spoons / Eventbrite terms (about $500M cash, $4.50 a share) and completion on 2026-03-10 (Bending Spoons SEC 6-K). Previously "terms BG".
- Meetup organizer prices reconfirmed (Standard from $29.99/mo, PRO from $55/group/mo; increased Jun 2024); no 2026 change found.
- Strava: 2024 report's +59% running-club participation; 2025 report's near-quadrupling of new clubs to about 1M; $2.2B valuation (May 2025, Sequoia), Runna and The Breakaway deals, confidential IPO filing with no listing as of Oct 2026.
- Discord 200M+ MAU (company claim) and confidential IPO filing (Jan 2026); no public S-1 found.
- Geneva purchase price ($17.0M cash, closed 2024-07-01).
- WhatsApp Community events (2024-05-01); Instagram broadcast channels (2023-02-16); Peanut's Feb 2017 launch; Luma Plus price.
- Salt Lake County and metro population (1.22M and 1.30M, July 2024).

**Still unconfirmed after recheck**
- WhatsApp Communities' Nov 2022 launch date; Nextdoor's SPAC date and profitability history; Wasatch Front population of about 2.7M; the 3.5-fold run-club multiple in Strava's 2025 report (secondary source only).
- All other [BG] items (Nextdoor Kindness Reminder, Strava club software details, Oldenburg, Mario Small, Boothby, Meetup role names, Facebook Groups admin tooling) were not rechecked.

