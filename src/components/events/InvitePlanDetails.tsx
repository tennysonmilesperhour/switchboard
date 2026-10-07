import { Glyph } from '@/components/ui/Glyph';
import { formatDateTimeRange } from '@/lib/format';
import { googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-links';
import { mapsSearchUrl } from '@/lib/maps';
import { safeHttpUrl } from '@/lib/security';
import { Icon } from '@/components/ui/Icon';

export interface InvitePlanDetailsProps {
  /** Who sent it, for the eyebrow line. */
  hostName: string | null;
  title: string;
  coverUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Resolved event zone, so the time reads as the host meant it. */
  timeZone: string | null;
  locationName: string | null;
  locationAddress: string | null;
  description: string | null;
  wishlistUrl: string | null;
}

const CHIP =
  'inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 ' +
  'text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta ' +
  'hover:text-terracotta-deep active:scale-[0.98] transition-all';

/**
 * The plan itself, as a guest sees it on a public invitation link — both the
 * per-person `/rsvp/<token>` page and the shareable `/i/<token>` one.
 *
 * These two pages used to render only the title and the start time, so an
 * invitation for a plan with a venue, an end time, a cover image, or a
 * paragraph of details arrived looking empty: a name, a date, and two buttons.
 * Everything the host filled in belongs here, in one place, so the two links can
 * never drift apart again.
 *
 * Nothing here is gated on a session — reading an invitation is open to whoever
 * holds the token (docs/SECURITY.md §5). Attendee lists deliberately stay out:
 * who else was invited is governed by the event's visibility flags, and this
 * surface has no viewer to check them against.
 */
export function InvitePlanDetails({
  hostName,
  title,
  coverUrl,
  startsAt,
  endsAt,
  timeZone,
  locationName,
  locationAddress,
  description,
  wishlistUrl,
}: InvitePlanDetailsProps) {
  // Both are host-typed and land in a `src`/`href`, so they are untrusted at
  // the sink even though they came from our own database.
  const cover = safeHttpUrl(coverUrl);
  const wishlist = safeHttpUrl(wishlistUrl);
  const mapUrl = mapsSearchUrl(locationName, locationAddress);
  // A location may be a name, an address, or both; show whichever exists, and
  // never repeat the address when it is the same string as the name.
  const where = locationName?.trim() || null;
  const address =
    locationAddress?.trim() && locationAddress.trim() !== where
      ? locationAddress.trim()
      : null;
  const details = description?.trim() || null;
  const calendarEvent = startsAt
    ? {
        title,
        description: details,
        location: [where, address].filter(Boolean).join(', ') || null,
        startsAt,
        endsAt,
      }
    : null;

  return (
    <>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="mb-6 w-full max-h-56 rounded-card object-cover shadow-lift"
        />
      )}
      <p className="text-sm font-bold tracking-wide uppercase text-terracotta-deep">
        {hostName ?? 'A friend'} invited you
      </p>
      <h1 className="font-extrabold tracking-tight text-4xl text-ink mt-2 text-balance">
        {title}
      </h1>
      <p className="mt-3 text-ink font-bold">
        {formatDateTimeRange(startsAt, endsAt, timeZone)}
      </p>

      {(where || address) && (
        <div className="mt-2 flex items-start gap-1.5 text-sm">
          <Icon name="mapPin" size={15} className="mt-0.5 shrink-0 text-terracotta-deep" />
          <span>
            {mapUrl ? (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ink underline decoration-line underline-offset-2 hover:text-terracotta-deep"
              >
                {where ?? address}
              </a>
            ) : (
              <span className="font-semibold text-ink">{where ?? address}</span>
            )}
            {where && address && (
              <span className="block text-ink-soft">{address}</span>
            )}
          </span>
        </div>
      )}

      {details && (
        <p className="text-ink-soft text-[15px] mt-4 leading-relaxed whitespace-pre-wrap">
          {details}
        </p>
      )}

      {!where && !address && !details && (
        // Otherwise a bare title and date read as a broken page rather than a
        // sparse one, and the guest has no idea whether more is coming.
        <p className="text-ink-faint text-sm mt-4 leading-relaxed">
          No location or details yet — {hostName ?? 'your host'} will fill you in.
        </p>
      )}

      {(calendarEvent || wishlist) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {calendarEvent && (
            <>
              <a
                href={googleCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className={CHIP}
              >
                <Glyph emoji="📅" size={14} />Google Calendar
              </a>
              <a
                href={outlookCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className={CHIP}
              >
                <Glyph emoji="📅" size={14} />Outlook
              </a>
            </>
          )}
          {wishlist && (
            <a href={wishlist} target="_blank" rel="noopener noreferrer" className={CHIP}>
              <Glyph emoji="🎁" size={14} />Wishlist
            </a>
          )}
        </div>
      )}
    </>
  );
}
