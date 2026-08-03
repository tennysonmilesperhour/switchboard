import { ImageResponse } from 'next/og';

/**
 * The unfurl card for `appInviteUrl()` — the bare-origin "here's Switchboard"
 * link (src/lib/links.ts).
 *
 * Every other link in the contract already unfurls: /i/<token>, /rsvp/<token>,
 * /events/<id> and /join/<id> all set `openGraph`, and a plan link gets a
 * rendered card from /api/og/event/<id>. The app link was the only one with no
 * image and no og:* tags at all, which is backwards — it is the one link whose
 * entire job is to be dropped into a text message, and it was arriving as a
 * bare blue URL while every plan invite arrived as a card.
 *
 * The bare origin redirects a signed-out visitor to /welcome, and unfurlers
 * follow that redirect, so the card lives on the page the link actually lands
 * on rather than on `/` (which, for a signed-out crawler, renders no document
 * at all — it is a 307).
 *
 * Static by construction: nothing here is personalised, so it renders without a
 * database read. Resolving an inviter for a signed-out crawler would mean a
 * service-role read on an anonymous request, which is the handle-enumeration
 * surface the link was deliberately built without.
 */
export const runtime = 'nodejs';

export const alt =
  'Switchboard — make plans, like magic. Plans without the pressure.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          // Brand tokens from globals.css (--color-cream / --color-ink).
          background: '#f5f5f6',
          color: '#191d22',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 32, color: '#f82a63' }}>
          switchboard
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 92,
              lineHeight: 1.02,
              fontWeight: 700,
            }}
          >
            Make plans.
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 92,
              lineHeight: 1.02,
              fontWeight: 700,
              // The hero's pink→violet gradient word, flattened to its mid-stop:
              // ImageResponse has no background-clip:text.
              color: '#d1318a',
            }}
          >
            Like magic.
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#565a60' }}>
          Plans without the pressure
        </div>
      </div>
    ),
    { ...size },
  );
}
