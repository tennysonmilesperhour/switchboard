> **Research memo, 2026-10-17.** Point-in-time evidence behind [`../LANDSCAPE.md`](../LANDSCAPE.md). Claims carry their verification tags; product truth lives in `src/lib/features.ts`. Do not update this file as the product changes; update `LANDSCAPE.md`.

# B. Event invitation and hosting tools: competitive memo for Switchboard

Prepared 2026-10-17. Segment: Partiful, Luma, Apple Invites, Posh, Evite, Paperless Post / Flyer, plus Eventbrite, Facebook Events, Howbout, Heylo and 2025-2026 entrants.

## How to read the sourcing

- **[V]** = confirmed by a web search in this session; the URL inline is where it came from.
- **[K]** = from my prior knowledge of the product (training data through mid-2026), NOT re-verified this session. Treat as likely but check before quoting externally.
- **[?]** = conflicting or weakly sourced claim.

Method limits, stated plainly: page fetching was blocked in this environment (DNS refused for wikipedia, techcrunch, partiful.com, help.luma.com, support.apple.com), so everything [V] comes from search-result extracts, not full-page reads. The shared web-search budget for this turn ran out partway through, before Apple Invites follow-ups, Evite, Paperless Post, Eventbrite, Facebook Events, Howbout and Heylo were searched. Those sections are mostly [K] and say so. A follow-up pass could verify them.

One correction to the brief: Switchboard is no longer email-only. `docs/SMS.md` in this repo describes shipped, consent-first SMS. A guest sends `JOIN <invitation token>` from their own phone after reading a disclosure, members opt in separately in Settings, and replies use `YES <code>` / `NO <code>`. This memo treats that as part of Switchboard's counter-position.

---

## 1. Partiful (the category leader for casual, social hosting)

### Company and metrics
- Founded by Shreya Murthy (CEO) and Joy Tao (CTO), both ex-Palantir. Launched in 2020, during the pandemic, with a stated goal of "bringing people together in person" [V] ([CNBC, 2025-04-19](https://www.cnbc.com/2025/04/19/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple.html)). Founding year is listed as 2019 in some profiles [?] ([Sherwood News](https://sherwood.news/business/partiful-party-event-planning-app-monetization-and-future-q-and-a/)).
- $20M Series A in late 2022, led by a16z. That brought total funding to about $27.3M at a reported $120M pre-money valuation (PitchBook via search extract) [V] ([Sacra](https://sacra.com/c/partiful/)). A 2025 rumor of a $400M valuation was disputed by a Partiful spokesperson [V] ([Newcomer](https://www.newcomer.co/p/vcs-feel-the-market-cheer-heading)). Murthy: "We're fortunate to have a ton of investor interest, but we're well-capitalized and not actively thinking about the next round" [V] ([Sherwood News](https://sherwood.news/business/partiful-party-event-planning-app-monetization-and-future-q-and-a/)).
  - Recheck [V]: the $20M Series A closed in 2022 (announced November 2022), with a16z leading and Initialized Capital among the investors ([Fortune](https://fortune.com/2023/05/23/partiful-founders-startup-raises-series-a), [VCBacked](https://www.vcbacked.co/company/partiful)). **No later round (Series B or other) was found as of 2026-10-17.** Searches for a 2025 or 2026 Partiful raise returned only name-alikes (Partly's $50M Series B, Partful's Series A). The $120M pre-money figure was not rechecked.
- Sensor Tower estimated about 500K monthly users in Q1 2025, up 400% year over year, with about 90% in the US. Partiful said it added 2M new users in 2025 (as of April) [V] (CNBC above). No 2026 user figure was found (unconfirmed after recheck).
- Same CNBC piece, for comparison [V]: Eventbrite 4.4M MAU (Sensor Tower, Q1 2025), Evite "more than 20 million" MAU (Evite's own claim), Punchbowl about 85K ([NBC syndication of CNBC](https://www.nbcnewyork.com/news/business/money-report/meet-partiful-the-gen-z-party-planning-staple-thats-taking-on-apple/6231135/)).
- Google Play's **Best App of 2024** [V] ([Google blog](https://blog.google/products/google-play/google-play-best-apps-games-2024/), [TechCrunch 2024-11-18](https://techcrunch.com/2024/11/18/partiful-is-googles-best-app-of-2024/)). This came despite 95% of its roughly 1.08M downloads that year being on iOS, per Appfigures [V] (TechCrunch).
- App Store: about 5.0 stars from roughly 153K to 217K ratings, depending on the aggregator; rated 18+; last updated 2026-07-21 per Bitrise [V] ([App Store](https://apps.apple.com/app/id1662982304), [AppFollow](https://apps.appfollow.io/ios/partiful-party-invite-maker/1662982304?country=us)).
- Murthy was named to the **TIME100 Next 2025** list [V] ([TIME](https://time.com/collections/time100-next-2025/7318880/shreya-murthy/)).

### Core loop
- **Create** [K]: one scrolling editor with title, date and time, location, a poster (upload, GIF, template, or AI-generated), a theme, a screen effect, and a description. Only the title is truly required; date can be "TBD". The editor *is* the invite preview, so what you see is what guests get. Google cited the "Party Genie" tool that "helps quickly design invitations" [V] (Google blog above).
- **Delivery**: link-first, SMS-native. A 2024 guide calls it "primarily based on text message invitations" [V] ([party.pro](https://party.pro/Partiful)). Hosts paste the link into group chats or invite contacts and past guests ("Mutuals") directly. Partiful then texts updates from its own number [K].
- **Guest RSVP**: no app or account needed to RSVP [V] ([Slashdot](https://slashdot.org/software/p/Partiful/), [AlternativeTo](https://alternativeto.net/software/partiful/about)). A **phone number is required** and verified by SMS code [V/K] ([WNYC/Slate segment](https://wnyc.org/story/icymi--is-partiful-cancelled/) on the phone-number requirement). RSVP states are Going / Maybe / Can't Go, each with an emoji [K]. One user reports that picking Maybe prompted "pls commit soon" [V] ([Substack comments](https://worldspiritsockpuppet.substack.com/p/things-i-hate-about-partiful/comments)).
- **Host controls** [K, partly V]: hide the guest list, password protection [V] (Slashdot), require approval, capacity with waitlist, +1s, RSVP questions, co-hosts.
- **Day-of**: text blasts to guests filtered by status [K]. An unofficial CLI documents a 480-character blast limit and a "SMS warning" [V] ([partiful-cli PR](https://github.com/KalebCole/partiful-cli/pull/39)). Reminders ship automatically [K]; Vice credits them as useful "without being an annoying nag" [V] ([Vice](https://www.vice.com/en/article/partiful-mutuals-out-of-control)).
- **Post-event**: a shared photo album, plus "uniform text blasts to the group before and after the event" [V] ([Global Dating Insights](https://www.globaldatinginsights.com/featured/partifuls-crush-tool-brings-dating-style-matching-to-event-app/)). Attending once makes you a "Mutual" of everyone there, which powers future invites, discovery and Crush.

### Growth mechanics
1. **Every invite is a landing page.** A guest who RSVPs has handed over a verified phone number, so they become a reachable node without ever installing the app. Guest-to-host conversion happens because the invite itself is the product demo [K].
2. **The Mutuals graph.** Co-attendance forms the social graph. Hosts can then invite "Mutuals" in bulk, and the App Store listing promotes "events that your friends and mutuals are attending" plus an Explore page [V] (App Store). This is the strongest loop and also the biggest complaint (see failure modes).
3. **Campus programme.** A Spring 2026 "Campus Growth Manager" listing describes a performance-based, part-time student role: launching Partiful on campus during an "activation week" and recruiting hosts among student groups and venues [V] ([ResumeGeni mirror](https://resumegeni.com/jobs/campus-growth-manager-us-spring-2026-partiful-f02c13c7d2)).
4. **Facebook Events vacuum.** Murthy co-founded it as an alternative to Facebook Events, which "no one was using anymore" [V] ([Future Party](https://www.futureparty.com/p/partiful-mobile-app-facebook-events)). Sherwood framed it as having "filled a Facebook Events-shaped void" [V].
5. **Crush (late Dec 2025).** Users privately pick up to 10 Mutuals. If interest is mutual, both are notified and nudged to DM. The notification references only the last event they attended together. Rechecked [V]: picks are anonymous; the rollout began in select US markets in late December 2025 and expanded ahead of Valentine's Day 2026. Dates come from third-party coverage; no Partiful announcement was found. ([Global Dating Insights](https://www.globaldatinginsights.com/featured/partifuls-crush-tool-brings-dating-style-matching-to-event-app/), [YPulse 2026-01-28](https://www.ypulse.com/newsfeed/2026/01/28/partiful-is-officially-throwing-their-hat-in-the-dating-app-ring/)). This is Partiful moving onto Switchboard's mutual-interest turf.
6. **Year-in-review recaps.** I could not verify a "Partiful Wrapped" this session; searches returned only generic Wrapped clones [?]. My recollection is that Partiful has run December recap moments, but do not cite this until it is checked. (Unconfirmed after recheck.)
7. **Brand banter on social.** When Apple Invites launched in Feb 2025, Partiful posted a "copycat" joke on X [V] (CNBC).

### Psychology
- **Guest list as social proof.** Faces and names on the page do the selling. "Who's going" is the reason to say yes [K].
- **The invite as an artifact.** The poster plus effect is screenshot-able and gets shared to Stories. Hosting becomes self-expression [K]. Fortune and others tie the brand to its audience with lines like "[parties] for hot people" [V] ([Fortune 2023](https://www.fortune.com/2023/05/23/partiful-founders-startup-raises-series-a)).
- **Maybe pressure.** The "pls commit soon" nudge shows that Partiful treats Maybe as a soft failure [V].
- **Activity feed** [K]: guests comment, react and post GIFs on the event page, so the invite fills with energy before the party.

### Design language
- Maximalist, playful and low-fi [K]: a full-bleed poster (often a GIF), bold display type, background themes (gradients, patterns, textures) and full-screen particle "effects" layered over the page. Emoji are used everywhere as UI. CNBC credits its "often humorous, casual designs" as what sets it apart for Gen Z [V].
- Shareability [K]: the OG image is the poster, so an iMessage preview shows the art and title. The art carries the message before anyone taps.
- Switchboard's "Afterparty" preset (plum-black, party pink, Bricolage poster type, in `src/lib/themes-app.ts`) is a fair homage. What it lacks is the per-event poster and effect.

### Voice (verbatim where [V])
- App Store tagline: "The easiest way to plan and discover social events." Description: "Create free event invite pages, send text updates, sell tickets, and find the best events near you." [V] (AppFollow) Rechecked: the App Store name is "Partiful: Party Invite Maker", and the Apple-hosted variant drops "and discover". The listing now advertises ticket tiers, promo codes, Apple Pay checkout, QR check-in and Stripe payouts; it shows over 210K ratings averaging 5.0 ([AppFollow](https://apps.appfollow.io/ios/partiful-party-invite-maker/1662982304?country=us)).
- Site title: "Partiful [dash] The party starts here" [V] ([DailyDropout listing title](https://www.dailydropout.fyi/startup/partiful)). Their dash is rendered as [dash] here. (Unconfirmed after recheck: no second source; DailyDropout's own headline was "Lowkey planning for highkey parties", which is its own phrase, not Partiful's.)
- Maybe nudge: "pls commit soon" [V]. Lowercase, texting register, a little bossy and affectionate. That captures the house voice [K].
- Murthy on Apple: "We haven't really seen any users that have been leaving Partiful for Apple Invites." [V] (CNBC)

### Business model
- Core invites are free [V] (Sherwood/Wikipedia extract).
- **Group Order** [V/C]: hosts buy supplies through an Instacart partnership; Partiful earns a $5 delivery fee plus a share of order value ([Sacra](https://sacra.com/chat/h/dbc61fbd-2597-421d-95bc-67a46451818f/), [Startup Fortune 2026-06-24](https://startupfortune.com/?p=12738)). Recheck: the $5 flat delivery fee is confirmed, but CSP Daily News describes it as Instacart's separate party app **Fizz** (shared cart, flat $5 delivery) that Partiful users can reach through a partnership ([CSP Daily News](https://www.cspdailynews.com/technologyservices/instacart-launches-party-cart-orders-fizz)). Partiful's revenue share rests on Sacra alone (unconfirmed after recheck).
- **Ticketing (launched 2026-06-02)**: described as its "first major monetization product." It offers free or paid tiers, capacity caps, promo codes, payouts and door check-in on iOS, Android and web, built on Stripe Connect Accounts v2. Guests pay by card, ACH or wallet [V] ([Orange Leader](https://smb.orangeleader.com/article/Partiful-Launches-Ticketing-Bringing-Paid-Events-Into-the-Social-Platform-Where-People-Already-Make-Plans/6a1f7d69004597ee6ba14b2d), [Stripe case study](https://stripe.com/gb/customers/partiful-spotlight)). **Fee [V, secondary]:** not standardized. An example on Partiful's site adds a $7 fee to a $50 ticket (about 14%); press puts typical fees at about 10% to 15% (search extract of launch coverage; Partiful's own fee page was not reached). A Westfield post from June 2026, "What Happens When Partiful Throws Its Own Party", suggests brand-hosted events ([Westfield](https://goodfest.westfield.com/2026/06/what-happens-when-partiful-throws-its-own-party/)); title only, not read [?]. Sacra also notes greeting cards and micro-content on the homepage as possible revenue lines [V].

### Complaints and failure modes
1. **Mutuals spam.** Vice: the writer gets more invites from strangers than friends; some are ticketed, and some arrive by automated text without an RSVP. The only defences are reactive: opt out per person or block. Vice asks for a setting that stops mutuals from mass-inviting [V] ([Vice](https://www.vice.com/en/article/partiful-mutuals-out-of-control)). **This is the clearest evidence for cascades and consent-first invites.** Recheck: no evidence that a recipient-side "no invites from mutuals" setting has shipped. A Partiful FAQ page still describes the host side, "invite any of your Past Guests and Mutuals" ([FAQ mirror at getpartiful.com](https://getpartiful.com/faq/cm); this domain may be unofficial). Treat "no global opt-out exists" as likely, unconfirmed.
2. **Phone number as identity.** RSVP requires a phone, which critics call "the single most identifiable PII" and a map of offline social networks [V] ([WNYC/Slate, June 2025](https://wnyc.org/story/icymi--is-partiful-cancelled/)). Partiful does hide numbers from other guests; one user praised it for keeping "creeps or weirdos" from getting your number [V] (Substack comments).
3. **Palantir backlash (June 2025).** An NYC Noise post listed Palantir alumni on the team and alleged government access to data. That allegation is unverified, and no Partiful response was found [V] ([Slate/WNYC](https://wnyc.org/story/icymi--is-partiful-cancelled/), [piefed mirror](https://piefed.jeena.net/post/226672)). The lesson is about trust posture, not facts: a social graph built on phone numbers is easy to frame as surveillance.
4. **Maybe-pressure and flakiness** [K]: the Going count overstates attendance, and "Maybe" is both noise and shame.
5. **Public guest lists** [K]: the default view shows the full list to any invitee. That lets someone check whether a specific person will be there, which is the stalking or avoid-the-ex vector. Hosts can hide it, but the default favours social proof.

---

## 2. Luma (luma.com, formerly lu.ma)

### Company and metrics
- Founded by Victor Pontis and Dan (Danqing) Liu. It started as a tool for monetizing Zoom events, with a $3M seed in December 2020 led by Maven Ventures and Venrock [V] ([Crunchbase News](https://news.crunchbase.com/startups/exclusive-luma-raises-3m-to-enable-business-growth-on-top-of-zoom/), [Maven](https://medium.com/maven-ventures/announcing-our-investment-in-luma-to-enable-creators-f45076ccbc81)). PitchBook lists a Series A in Jan 2023 without an amount [V/?] ([PitchBook](https://pitchbook.com/profiles/company/454782-88)). **Recheck [V-corrected]:** CB Insights lists total raised as $3M, last raised $3M on 12/7/2020, and a jobs directory lists stage "Seed", total $3M ([CB Insights compare](https://www.cbinsights.com/compare/luma-2-vs-partiful), [Crunchbase News](https://news.crunchbase.com/?p=39471)). No 2023 to 2026 round was found. Cite Luma as "seed-funded ($3M, 2020), profitable, no disclosed later round"; treat the PitchBook Series A as unconfirmed. Do not confuse it with Luma AI, the video model company that raised a $900M Series C [V].
- Extremely lean. Pontis described "6 full-time people working on Luma" (3 engineers and 3 designers) [V] ([X, Jan 2025](https://x.com/VictorPontis/status/1876723918020452809), [pont.is](https://pont.is/p/how-luma-works)), and elsewhere "a small team of 7 people powering millions of event registrations every month." He said ARR went from $2M to $8M in a year, then 2022 layoffs, then profitability, and that Luma grew "pretty much entirely organically via word of mouth" [V] ([LinkedIn](https://www.linkedin.com/in/vpontis/)). A Sept 2026 report claims Luma tripled in 2026 to eight-figure ARR [?] ([Wisevoter](https://wisevoter.com/world/us/2026/09/29/luma-event-platform-growth-2026)). Latka's "$100M ARR, $130M raised" conflicts with every other source and should be ignored [?].
- In SF, Luma data showed nearly 2,000 live events in a month, almost double the year before, with AI events up more than 4x to 578 [V] ([CO/AI](https://getcoai.com/news/not-your-grandfathers-friday-night-fights-techies-flock-to-robot-boxing-matches-in-sf/)).

### Core loop
- **Create** [K]: title, date and time, location (or virtual link), cover image, theme, description, then publish. Ticketing, approval, capacity and questions are optional toggles. A good page takes about 60 seconds.
- **Register**: name and email are required for everyone. Hosts can add questions [V] ([Luma help: registration](https://help.luma.com/p/event-registration-process)). Login is an email code; no password [K].
- **Approval and waitlist**: hosts can require approval and customize the approved and declined emails, though without per-guest variables. Waitlist is toggled under Event Capacity and is free-events-only for now. Hosts approve or decline individually or in bulk, with an optional message [V] ([Luma help: waitlist](https://help.luma.com/p/waitlist.md)). Only hosts can approve, refund or manage waitlists; Luma support will not [V] ([Contacting hosts](https://help.luma.com/p/contacting-event-hosts)).
- **Delivery**: email first, plus SMS, WhatsApp and push per one directory [V] ([Startups.fm](https://startups.fm/startups/lu-ma)). Blasts can be scheduled [V] ([Luma help index](https://help.luma.com/t/events)). Rechecked against Luma's own help [V]: invites, reminders and blasts go by SMS to guests with a linked phone in the US and Canada, and by WhatsApp in most other countries. Hosts "cannot turn off email / SMS for a specific communication"; guests control their channels and opt out with STOP, and back in with START (US short code 96056) ([Luma help: SMS / WhatsApp](https://help.luma.com/p/sms-whatsapp-messages)). This is a guest-controls-channel precedent worth citing.
- **Day-of** [K]: QR tickets in Apple Wallet and a host check-in scanner.
- **Post-event** [K]: feedback emails and "follow" on the host calendar so the next event reaches you.

### Growth mechanics
1. **Calendars as subscriptions.** Every host owns a Calendar that people subscribe to. City Discover pages (for example `lu.ma/sf`) and community calendars are browsable, and each one is also an **iCal feed** [V] ([iCal syncing](https://help.luma.com/p/ical-syncing), [Calendars](https://help.luma.com/t/calendars)). Your personal feed covers events you host, registered for, or were invited to, and excludes declined ones [V]. Subscription is follow-the-host with no algorithmic feed.
2. **The tech and AI community wedge.** Luma became the default link format in SF and NYC tech. Organizers list events in "a couple SF Luma calendars" next to newsletters like SF IRL and Cerebral Valley [V] ([Bay Area Founders Club](https://bayareafoundersclub.substack.com/p/bay-area-events-for-the-week-of-may-bfc)). Each event teaches attendees the format, and some of them host next [K].
3. **Guest list as networking.** "Who's going" with LinkedIn-ish profiles is the draw for professional events [K]. The flip side: Apify scrapers sell exports of Luma attendee lists "for any event where the host has the guest list enabled" [V] ([Apify](https://apify.com/doin2much/luma-attendee-scraper)).

### Design language
- Clean and minimal, with design-led craft from a team that is half designers [V/K]. More than 40 themes, which "change frequently." Categories include **Minimal** (Standard, Quantum, each with light and dark variants), **Confetti**, **Warp**, and **Special Effects** (Champagne, Bokeh). "Each theme comes with custom fonts from a curated collection" [V] ([Luma help: themes](https://help.luma.com/p/event-themes-and-customization.md)). Unofficial style references cite Graphik as the UI face [?] ([Refero](https://styles.refero.design/style/680b0fff-26d0-45c3-808b-d571ff45eb99)).
- The page anatomy [K]: square cover art on the left (or on top on mobile), title in large type, host avatars, a date block, and a map, with a single black Register button. Typical copy is "Registration," "Approval Required," "X Going" with stacked avatars. The OG image is a generated card with the cover, title and date, so iMessage and Slack previews look premium even for a free meetup.
- Switchboard's "Guestlist" preset ("Cool white, fine lines, black buttons. Calm and exact.") is a faithful read of Luma.

### Voice
- Tagline on the site [V, via localized page]: "Delightful events start here." The Spanish homepage rotates "Eventos encantadores empiezan aquí" ([luma.com/?locale=es](https://luma.com/?locale=es)), and the App Store name is "Luma - Delightful Events" ([App Store](https://apps.apple.com/it/app/luma-delightful-events/id1546150895?l=en-GB)). The English wording was not seen directly. Calm, competent and polite; never jokey. Help-center voice is plain and specific [V] (the waitlist and registration articles above).

### Business model
- Free plan: 5% platform fee on paid tickets, on top of Stripe. **Luma Plus: $59/mo billed annually, 0% platform fee** [V] ([luma.com/pricing](https://luma.com/pricing?locale=ja), [xpay snapshot May 2026](https://www.xpay.sh/agent-ready-index/lu-ma/)). Month-to-month is reportedly about $69 ([TickPick](https://www.tickpick.com/blog/organizer/tickpick-vs-luma)); now [V]: localized luma.com/pricing pages show $59/mo with a "14%" saving for annual billing, which implies about $69 monthly. Plus also includes up to 5,000 invites and newsletters a week, sales-tax collection, and five calendar admins; extra sending is $50/mo for 10,000 weekly sends, up to $800/mo for 100,000 ([luma.com/pricing](https://luma.com/pricing?locale=de)). TickPick puts break-even at about $1,180/mo in ticket sales. Free events are free, so the long tail of hosts subsidizes the network and paid organizers monetize it.

### Failure modes
- **Guest-list scraping** and sales spam to attendees [V] (Apify listings above).
- **Deliverability as a moderation tool.** Luma blocks a calendar's email sending after high bounce or spam rates, which pauses invitations and reminders [V] ([help llms.txt](https://help.luma.com/llms.txt)). Copy this.
- **Approval anxiety** [K]: "Pending approval" for days with no signal; guests do not know if they are in.
- Waitlist does not support paid events [V].

---

## 3. Apple Invites (launched 2025-02-03)

- **What it is**: a free iPhone app (iOS 18+) plus web at `icloud.com/invites` [V] ([Apple press release via BusinessWire](https://www.businesswire.com/news/home/20250203932522/en/Introducing-Apple-Invites-a-new-app-that-brings-people-together-for-life%E2%80%99s-special-moments)).
- **Who pays**: **creating requires iCloud+** (from $0.99/mo). "Guests can view and respond to an invitation using the new iPhone app or on the web without needing an iCloud+ subscription or an Apple Account" [V] (press release). Distribution is the moat: it rides an existing subscription and the Apple ID graph.
- **Features** [V]: share by link, track RSVPs, backgrounds from your photos, Apple's built-in images or emoji. Maps directions and Weather are added automatically. Image Playground and Writing Tools are built in. There is a shared Photos album and an Apple Music playlist per event ([MacTrast](https://www.mactrast.com/2025/02/apple-launches-new-invites-app-sports-icloud-features/), [AlternativeTo](https://alternativeto.net/news/2025/2/apple-launches-invites-a-new-event-planning-app-with-management-tools-and-shared-albums/)). One outlet claimed "Hide My Email for anonymous RSVP responses"; the official release does not say that [?].
- **Requirements, rechecked [V]:** creating requires iCloud+; guests need no app, Apple device or account to RSVP. Android guests RSVP at icloud.com and verify with an email code (since v1.12, Oct 2026, by tapping a link). If the email matches an Apple Account, they must sign in. Viewing the Shared Album or playlist may require an Apple Account ([SlashGear](https://www.slashgear.com/2053580/can-you-send-apple-invites-to-android-users), [TechRadar](https://www.techradar.com/phones/ios/how-to-use-apple-invites)).
- **2026 updates [V, new]:** Apple is iterating monthly, so the "thin" critique is ageing.
  - v1.8 (April 2026): seven features, including an Invites iMessage app and an All Events dashboard ([9to5Mac](https://9to5mac.com/2026/04/23/apple-invites-for-iphone-adds-7-new-features-including-an-imessage-app/), [MacRumors](https://www.macrumors.com/2026/04/24/apple-invites-app-for-iphone-updated)).
  - June 2026: **co-hosting**, new backgrounds, and an option to **show invited guests to all attendees** ([MacRumors](https://www.macrumors.com/2026/06/23/apple-invites-app-gets-co-hosting/), [iPhone in Canada](https://www.iphoneincanada.ca/2026/06/24/apple-invited-app-gets-cohosting-perks-in-latest-update/)).
  - v1.10 (July 2026): emoji reactions to RSVP replies and a confetti animation on response ([MacRumors](https://www.macrumors.com/2026/07/21/apple-invites-app-two-new-features/)).
  - v1.12.0 (Oct 2026): full-resolution Shared Albums, better Image Playground backgrounds, and email verification by link ([MacTrast](https://www.mactrast.com/2026/10/apple-invites-app-has-been-updated-adding-three-new-features/amp/)).
- **Create flow** [K]: pick a background, add title, date and location, add a note, then preview and share. About 4 screens. The card is a portrait poster with the photo full-bleed and title in a rounded system face (SF Pro / New York variants), with gentle parallax and glassy material. The design is native, polished and safe. RSVP is Going / Not Going / Maybe with an optional note [K].
- **Weaknesses** [K, partly V-corrected]: it was not on Android at launch (web RSVP only), has no ticketing, a thin guest feed, and no discovery or graph beyond Contacts. Hosts must pay, and the paywall sits on the side that recruits. Co-hosting, which was missing at launch, shipped in June 2026 (see above). CNBC (April 2025) quoted Partiful saying it had not seen users leave for Apple Invites [V]. I found no adoption numbers for Apple Invites [?] (unconfirmed after recheck). Approval-required RSVPs were not found in any 2026 update notes.
- **Lesson**: native polish plus distribution was not enough to dislodge Partiful within 18 months, at least on the evidence available. Culture, voice and the guest-side social layer matter more than rendering quality.

---

## 4. Posh (posh.vip): nightlife and creator ticketing

- NYC-based, co-founded in 2019 by NYU students **Avante Price (CEO) and Eli Taylor-Lemire** [V-corrected; "Eric Thomas" was wrong] ([Founded](https://www.founded.com/posh-event-platform-founders/), [AfroTech](https://afrotech.com/posh-series-a-round/)). It raised a $5M seed in April 2023 and a **$22M Series A in July 2024** led by Goodwater, with FirstMark, Companyon and Epic. At that point it reported 2M registered users, $95M in lifetime bookings and about 5,000 events a month [V] ([POCIT 2024-07-25](https://peopleofcolorintech.com/articles/black-duo-leads-posh-to-22m-series-a-success-the-app-upgrading-your-social-life/), [Techleap](https://finder.techleap.nl/news/feed/posh-raises-22m-in-series-a)).
- **Series B: $37M led by FirstMark (2026)** for product, marketing and infrastructure for "larger festivals and global event organizers." Reported equity totals vary: $66.8M (AlleyWatch, citing an SEC filing) versus $105M (Simplify) [V/?] ([Pulse 2.0](https://pulse2.com/posh-37-million-raised-for-digital-ticketing-and-event-management-platform-expansion/amp/), [Simplify](https://simplify.jobs/c/Posh)). Rechecked [V]: announced March 19, 2026 (Fortune exclusive), with Causeway, Goodwater, Companyon and Epic participating ([Fortune](https://www.fortune.com/2026/03/19/exclusive-posh-lands-37m-series-b-what-are-we-doing-tonight-problem)). Scale [C]: 6M to 8M users and about 50,000 organizers; Fortune reports $350M GMV, 25M tickets issued and an estimated $40M cumulative revenue ([AfroTech](https://afrotech.com/black-owned-live-events-platform-posh-raises-37m-series-b)).
- **Positioning**: a "TikTok-like interface for event discovery," customizable event pages, and a Gen Z focus [V] (Techleap). Revenue comes from ticket fees [K]. Its growth engine is promoters and creators who bring their audience, with referral and affiliate mechanics for promoters [K, details unverified].
- **Relevance to Switchboard**: low for the core loop, since Posh is for public, paid parties. It is useful as a warning: once a social-hosting app adds paid public events (as Partiful did in June 2026), its invite graph starts carrying promotion. That is exactly the Vice complaint.

---

## 5. Evite, Paperless Post / Flyer, Eventbrite, Facebook Events (mostly [K]; partly verified 2026-10-17)

- **Evite** [K]: the 1998 incumbent. Email-first, ad-supported free tier plus Premium (ad-free, more designs) and paid single-event upgrades. It has a guest-list-forward page with Yes/No/Maybe and comments. Its reputation is dated, ad-heavy and spam-adjacent. Lesson: ads on the invite page cheapen the artifact, and email reminders without controls feel like marketing.
  - Rechecked [V]: Premium is a **one-time charge per event**, priced by guest count: Silver $17.99 (12 guests), Gold $36.99 (30), Platinum $68.99 (75), Diamond $99.99 (750). Evite Pro is $249.99/year for up to 2,500 guests per invitation ([Evite support: Premium pricing](https://support.evite.com/premium/what-is-premium/premium-pricing)). Premium removes ads and adds animated reveals, envelopes and a host photo gallery. Evite told CNBC it had "more than 20 million" MAU in Q1 2025 (company claim). Evite is still far larger than Partiful by its own count; "dated" describes its reputation, not its reach.
- **Paperless Post / Flyer** [K, founders V]: founded by siblings James and Alexa Hirschfeld; the year is 2009 per the Boston Globe and Craft, or 2008 per Wikipedia [C] ([Boston Globe 2024](https://www.bostonglobe.com/2024/05/24/lifestyle/siblings-who-changed-how-we-party/), [Wikipedia](https://en.wikipedia.org/wiki/Paperless_Post)). Flyer launched in 2018 for casual events and is built around "Vibes": curated sets of images, GIFs, colors, layouts and text animations [V] ([TechCrunch 2018](https://techcrunch.com/2018/06/19/paperless-post-introduces-flyer-for-more-casual-invitations)). Premium designer cards (Kate Spade, Oscar de la Renta and others) with envelope-opening animation, paid through "Coins." Flyer is its cheaper, more casual line (current Flyer pricing and the Coins model unconfirmed after recheck). RSVP tracking, messaging and reminders sit behind the card. Lesson: the **opening animation is the artifact**, and a ceremony moment raises perceived value. For weddings and formal events, design quality is willingness-to-pay.
- **Eventbrite (consumer side)** [K]: public, ticketing-first, and discovery-heavy. Its consumer experience is transactional, with buyer fees, marketing emails and "follow organizer." Its lesson is negative: once guests are leads, invites feel like ads. Scale [V]: 4.4M MAU in Q1 2025, up 2% year over year (Sensor Tower via CNBC).
- **Facebook Events** [K, with V framing]: the default through the 2010s. It declined as young users left Facebook and Meta deprioritized it. Partiful's founding story is explicitly the vacuum it left [V] (Future Party). Meta has reportedly been making events and local content more prominent, with personalized recommendations and new invitation handling, to win back young adults (Engadget via [thenote.app](https://thenote.app/post/en/facebook-is-pushing-local-content-and-events-to-try-to-win-back-young-adults-9kdatb53gs); date not shown) [V, undated]. No usage data for Events was found. Lessons: (a) an invite system tied to a declining identity platform dies with it; (b) its best mechanics (Interested/Going, friend-of-friend visibility, "X friends are going") are still the expected grammar.
- **Howbout** [V]: a London-founded social calendar app where friends share availability and propose plans. It sits closer to Switchboard's availability signals than to invites. It raised an **$8M Series A led by Goodwater Capital** with FJ Labs (dated Sept 2024 or July 2025 [C]), after a £1.92M round in 2022; more than $13M in total. It reports "almost 5 million users", and the **US is its largest market** ([Techleap](https://finder.techleap.nl/news/feed/howbout-calendar-raises-8m-series-a), [tech.eu 2022](https://tech.eu/2022/11/02/a-ps192-million-raise-for-social-planning-app-howbout-that), [Entrepreneur Loop](https://entrepreneurloop.com/uk-based-social-calendar-startup-howbout-raises-8-million-series-a-after-successful-capital-raising-pitch/)). This is the most direct availability-first competitor in this memo and deserves its own teardown.
- **Heylo** [V]: group and club management (run clubs, sports, communities) with recurring events and member payments. Events, communications and payments are free; Heylo "takes a small service fee on payments collected", and paid tiers add email blasts and forms ([heylo.com](https://heylo.com/running-club)). Payments volume grew from a few thousand dollars to more than $1.5M in a year ([DestinationCRM](https://www.destinationcrm.com/Articles/CRM-Insights/Case-Studies/Heylo-Manages-Membership-Money-with-Brevo-163849.aspx)). Lead investors are Precursor (Charles Hudson) and Worklife (Brianne Kimmel); the amount was not found. Relevant for Switchboard's recurring and "Run it back" patterns, and as a free-core, take-rate-on-money precedent.
- **2025-2026 entrants**: Apple Invites (above); Partiful Crush (Dec 2025) and ticketing (Jun 2026); Posh Series B (Mar 2026); Apple Invites co-hosting (Jun 2026); Pie Community Homes (Aug 2026, see memo A). The others I know of, such as dinner-with-strangers apps like Timeleft and group-matching apps, sit in the "meet new people" segment and were not verified this session [?].

---

## 6. Cross-cutting technical notes worth copying

1. **OG image = the invite** (Partiful, Luma [K]). A dynamically rendered card with art, title, date and host, sized for iMessage's large-link preview (1200x630, readable at about 300px wide). Never leak private details into it: title and art only, no address and no guest names. Switchboard already has `src/app/api/og` and `share-link.ts`'s "safe to unfurl" decision, so this is about polish, not architecture.
2. **Phone verification without phone exposure** (Partiful [V]). Numbers are hidden from co-guests and hosts message through the platform. Switchboard's guest SMS goes further: the guest initiates, and consent is scoped to one invitation and expires.
3. **Deliverability circuit breakers** (Luma [V]): auto-pause a host's sending when bounce or complaint rates spike. Switchboard has global and per-recipient caps; a **per-host** reputation breaker is the missing layer.
4. **Calendar feeds** (Luma [V]): per-user iCal plus per-host and per-community feeds that exclude declined events. Low cost, sticky, and it puts you inside the calendar people already check.
5. **Approval flows with bulk actions and canned messages** (Luma [V]). Lesson from Luma's gap: show pending guests *when* the host usually decides, or let them withdraw.
6. **Stripe Connect Accounts v2 for embedded ticketing** (Partiful [V]) if Switchboard ever does cost-splitting or ticketing.
7. **Guest-list visibility as a host setting** (all [K]; Apple Invites added an opt-in "show invited guests to all attendees" option in June 2026 [V], which implies hidden by default there). Default it to the protective option: counts and friends-you-know visible, the full list only to the going guests.

---

## (a) The 12 most transferable lessons for Switchboard

1. **The invite page is the product demo.** Partiful and Luma both grew because guests experienced the full product without an account. Switchboard's account-free RSVP is right. Keep the first-touch page *complete* (art, who's hosting, what to do) and put the "make your own" prompt *after* the RSVP, never before.
2. **Make the invite an artifact.** A per-plan poster, cover image or emoji art, rendered in the OG card, gives people a reason to share and a reason to host. Afterparty, Guestlist and Prompt are app themes; per-plan art plus an optional effect is what makes a link worth forwarding.
3. **Distribution lives in the group chat.** The iMessage preview is the first impression for most recipients. Design the OG card at thumbnail size first, and A/B the title treatment.
4. **Social proof sells, but it should be scoped.** "Who's going" is the strongest yes-driver in every product here. Switchboard can show *how many* and *which of your people* without exposing the full list to everyone. Social proof without a stalking surface.
5. **Follow-the-host beats the feed.** Luma's calendars grew with almost no sales team. A "follow this host / this circle" subscription with an iCal feed is a cheap, durable retention loop that does not need an algorithm.
6. **Voice is a moat that Apple could not copy.** Apple shipped better rendering with free distribution, and Partiful reported no exodus. Switchboard needs a recognisable voice: warm, low-pressure, specific. Its error-code discipline (`SB-<AREA>-<REASON>`) is already a kind of voice, honesty under failure.
7. **Treat Maybe as information, not failure.** Partiful's "pls commit soon" pressures. Switchboard's private polls and availability signals can let a Maybe say *what would make it a yes* ("if it's after 7", "if Sam's going"), which no one in this segment does.
8. **The post-event moment drives the next invite.** Shared albums (Partiful, Apple), Crush (Partiful), and follow (Luma) all use the hour after the event. Switchboard's "Run it back" should fire then, prefilled with the same people and an anonymous "would do again?" signal.
9. **Hosts need reach, guests need brakes.** Every growth loop here (Mutuals, blasts, calendars) eventually turns against guests. Build the brake into the loop from the start: per-host rate limits, one-tap "fewer invites from this person," and invites that expire.
10. **Calendar presence is retention.** Luma's iCal syncing is a quiet superpower. Switchboard has `/api/calendar`; make sure accepted plans and followed hosts show up in Google and Apple Calendar automatically.
11. **Monetize the host's spend, not the guest's attention.** Partiful waited about six years before ticketing and used commerce (Group Order) first. Luma charges the paid organizer, not the free host. Neither runs ads on invites. Evite's ad-cluttered invites are the cautionary tale.
12. **Approval needs a clock.** Luma's pending state is a known anxiety point. Any approval or cascade step should show the guest where they stand and when they will hear back. That aligns with AGENTS.md's "no state is a dead end."

## (b) Five traps to avoid

1. **The co-attendance spam graph.** Partiful's Mutuals turned "we were at the same party once" into permission to text you about a stranger's ticketed event (Vice). Never let a past co-attendance grant invite rights by itself.
2. **Phone number as the identity key.** It drives verification and reach, and it also drives the "surveillance" framing (the June 2025 Palantir backlash). Keep phone optional, guest-initiated and expiring, as `docs/SMS.md` already does, and say so publicly.
3. **Public-by-default guest lists.** They enable checking whether a specific person will attend, plus scraping and sales spam (Apify scrapers on Luma). Default to counts and known faces.
4. **Paywalling the side that recruits.** Apple Invites charges the host, which caps its reach. Keep hosting free; if Switchboard monetizes, charge for power-host or organizer tools.
5. **Drifting into promotion.** Ticketing pulls an app's graph toward promoters (Posh's whole model, Partiful since June 2026). If Switchboard ever adds paid events, keep them out of the cascade and Mutuals-style surfaces entirely.

## (c) Table-stakes features Switchboard must match

| Area | Table stakes (who sets the bar) |
|---|---|
| Create | Under 60 seconds, title-only required, date can be TBD or polled (Partiful, Luma) |
| Art | Per-event cover or poster, theme, optional effect; AI or emoji fallback (Partiful, Apple, Luma 40+ themes) |
| Link preview | Rich OG card with art, title and date that works in iMessage, WhatsApp and Slack (all) |
| RSVP | No account, under 3 taps, Going / Maybe / Can't, optional note (all) |
| Host controls | Co-hosts, capacity + waitlist, approval with bulk actions, +1s, RSVP questions, hide guest list, password or private link (Partiful, Luma) |
| Comms | Announcements filtered by RSVP status; automatic reminders; calendar add (.ics) (Partiful blasts, Luma blasts) |
| Day-of | Directions, weather, "running late," map (Apple adds Maps and Weather automatically) |
| Post-event | Shared photo album; follow host; run it back (Partiful, Apple, Luma) |
| Identity | Email code or phone code login, no passwords for guests (Luma, Partiful) |
| Discovery | Opt-in public or community calendar with iCal feed (Luma) |
| Payments (later) | Cost splitting or tickets via Stripe Connect (Partiful, Luma, Posh) |

Switchboard already covers most of the first six rows (rooms, announcements, co-hosts, RSVP questions, account-free links, OG route). The visible gaps are likely per-plan poster art and effects, a shared album, follow-a-host calendar subscriptions, and the approval clock. Verify each against `src/lib/features.ts` before treating it as missing.

## (d) Where Switchboard's consent-first mechanics are a genuine counter-position

1. **Cascading invites versus broadcast.** Every incumbent is broadcast-first: blast the link, let the guest list sell it. Switchboard asks one friend or one wave at a time. That removes the public "who said no" ledger and the over-invite spam Vice describes. Frame it as **"nobody finds out they were second choice, and nobody gets invited by a stranger."**
2. **Private, anonymous polls versus visible Maybes.** Partiful turns hesitation into public pressure ("pls commit soon"). Switchboard lets people signal honestly without being seen hedging. No one else in this segment offers that.
3. **Mutual-interest matching versus Crush.** Partiful's Crush (Dec 2025) proves the demand for mutual reveal, but limits it to romance and to co-attendees. Switchboard's mutual matching on *plans* ("I'd go to X if you would") is the platonic, broader version, and it existed first in Switchboard's framing. Lead with it.
4. **Guest-initiated, expiring SMS versus phone-as-graph.** Partiful needs your number to RSVP and keeps it. Switchboard's `JOIN <token>` flow means the guest texts first, consent covers one plan, ends after the event or 30 days, and never shows the number to the host. Post-Palantir-backlash, this is a credible public privacy story. Write it on the marketing page.
5. **Availability signals versus the RSVP deadline.** Incumbents start from a fixed date and ask for a yes. Switchboard can start from who is free, which removes the most common reason for a no. Apple, Partiful and Luma all lack this. Only social calendars like Howbout (about 5M users, US its largest market, $8M Series A; verified 2026-10-17) approach it, which makes Howbout the competitor to watch on this point.
6. **Rooms that file themselves versus event comment walls.** Partiful's activity feed is noisy and public to all invitees. A plan room scoped to people who said yes, with chat that turns into logistics, is a quieter, more useful day-of surface.
7. **Calm as a brand.** Partiful is loud, Luma is professional, Apple is neutral. "Plans with less pressure" is an open emotional position in this segment. The themes can borrow their looks; the mechanics are what nobody else can copy quickly.

---

### Open items to verify in a follow-up pass
- Partiful: ticketing fee rate; whether a Mutuals opt-out setting shipped after the Vice piece; any year-in-review or "Wrapped" feature; current guest-list visibility defaults.
- Luma: any 2025-2026 funding; the claimed 2026 ARR; the exact current tagline; SMS and WhatsApp invite availability by region.
- Apple Invites: adoption data; iOS 26 or 2026 updates; whether hosts can require approval.
- Evite, Paperless Post, Eventbrite, Howbout, Heylo: all [K] claims above.

## Verification pass 2026-10-17

About 60 searches shared with memo A. Page fetches still failed with DNS errors, so checks rest on search-result extracts.

**Corrected [V-corrected]**
- **Posh co-founder:** Avante Price and **Eli Taylor-Lemire** (NYU, 2019), not "Eric Thomas". Series B dated March 19, 2026 (Fortune).
- **Luma funding:** the only disclosed round is the $3M seed (Dec 2020); CB Insights shows $3M total. The PitchBook "Series A Jan 2023" is unconfirmed. No 2024 to 2026 round found.
- **Apple Invites "weaknesses":** co-hosting shipped June 2026, alongside an iMessage app, an All Events view, emoji RSVP reactions and an opt-in guest-list display. Apple updates it roughly monthly, so "thin" is ageing.
- **Partiful Group Order:** the $5 flat fee is confirmed, but one source frames it as Instacart's separate Fizz app reached via partnership. The revenue share is Sacra-only.

**Newly verified [V]**
- **Partiful:**
  - No later round after the 2022 $20M Series A (a16z), as of 2026-10-17.
  - Crush picks are anonymous; rollout in select US markets from late Dec 2025, expanding before Valentine's Day.
  - Ticketing fee is not standardized: about 10% to 15%, e.g. $7 on a $50 ticket.
  - App Store name and tagline confirmed; over 210K ratings at 5.0.
  - CNBC comparison set: Eventbrite 4.4M MAU, Evite 20M+ MAU (claim), Punchbowl 85K.
- **Luma:**
  - Plus is $59/mo annual, about $69 monthly (14% annual saving).
  - Plus includes sending limits and add-on pricing.
  - SMS in the US and Canada, WhatsApp elsewhere; guests own their channels and hosts cannot override.
  - Tagline confirmed via the localized homepage and App Store name.
- **Apple Invites:** requirements confirmed; Android guests use email verification, and the album and playlist may need an Apple Account.
- **Evite:** per-event Premium pricing ($17.99 to $99.99) and Pro $249.99/yr, from the official support page.
- **Howbout:** $8M Series A (Goodwater), over $13M total, about 5M users, US largest market.
- **Heylo:** free core, fee on payments, over $1.5M payments volume.
- **Paperless Post:** founders confirmed; Flyer (2018) "Vibes".

**Still unconfirmed after recheck**
- Partiful: "Wrapped" or a year-in-review feature; site title "The party starts here"; $120M pre-money valuation; any recipient-side Mutuals opt-out (none found, so likely not shipped); 2026 user numbers.
- Luma: the Sept 2026 "tripled to eight-figure ARR" claim; the exact English homepage tagline.
- Apple Invites: adoption numbers; approval-required RSVPs.
- Paperless Post Coins and Flyer pricing; Facebook Events usage data.
