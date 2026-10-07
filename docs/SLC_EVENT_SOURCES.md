# Salt Lake event coverage

Switchboard's collector is a source registry, not one giant scraper. Each source
has a health record; the generic adapter understands schema.org `Event`, ICS,
and Trumba JSON. A source is enabled only after its live output is verified.

## Live in the first slice

| Source | Coverage | Adapter |
| --- | --- | --- |
| Salt Lake County | Parks, recreation, libraries, civic and community programming | Trumba JSON |
| Salt Lake Community College | Arts, galleries, music, workshops and public campus events | schema.org JSON-LD |

The Salt Lake City and Visit Salt Lake calendars are recorded but disabled:
their listing pages did not expose events in the supported public formats when
verified on October 7, 2026. They need dedicated adapters or publisher feeds.

## Next source packs

Add sources in this order, measuring unique upcoming events after deduplication:

1. **Local aggregators:** NowPlayingUtah, KRCL community calendar, City Weekly,
   SLUG, FunScout and SLC Weekender. Ask for feeds or syndication before scraping.
2. **Music and performance:** S&S Presents, Kilby Court, Urban Lounge, Metro
   Music Hall, Soundwell, The Complex, The State Room, Eccles Theater, Kingsbury
   Hall, Salt Lake County Arts, Utah Symphony, Ballet West and Pioneer Theatre.
3. **Classes and recurring activities:** Salt Lake City recreation, County
   Library, Harmons Cooking School, community education, climbing gyms, yoga,
   pottery, dance, maker spaces and outdoor clubs. Prefer ICS and booking feeds.
4. **Major platforms:** Eventbrite, Meetup, Ticketmaster, Luma and Partiful via
   their approved APIs, partner programs or organizer-submitted URLs.
5. **Closed social networks:** Instagram, Facebook and TikTok are discovery
   leads, not scrape targets. Use creator opt-in, approved platform APIs, emailed
   newsletters, and a “submit this post/link” workflow. Store only public event
   facts and always send the reader to the creator's canonical page.

## Source acceptance checklist

- The publisher permits automated access or supplies a feed/API.
- The source yields title, start time and a canonical organizer URL.
- At least one live event parses in an automated fixture test.
- Times are normalized to an instant and displayed in `America/Denver`.
- A failed source does not stop other sources, and its health row explains why.
- Duplicate title + start + venue records collapse across aggregators.
- Removed events age out; explicit cancellations are hidden.
- Switchboard never impersonates a signup flow or republishes gated content.

## Operations

Vercel calls `/api/cron/external-events` every three hours with `CRON_SECRET`.
The route fetches through the shared SSRF guard, caps response size, records
source health, and upserts normalized rows. Operators add or pause sources in
`event_sources`; readers can only select current `external_events` through RLS.
