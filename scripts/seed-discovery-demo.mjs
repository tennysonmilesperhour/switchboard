// Seed a full "public discovery" demo, geo-tagged around Salt Lake City, wired
// to ONE real viewer account so Row-Level Security actually lets that account
// see it. Running this lights up every discovery / sharing surface of the app:
//
//   • Map (/map)            — Live, Plans, Zones, and Shared-places layers, all
//                             pinned across the Salt Lake valley, plus twenty
//                             people to find in the directory under the map.
//   • Zones (/zones)        — public "serendipity zones" (visible to everyone),
//                             each with people actually checked into them.
//   • Moments (/moments)    — your own shared place + anonymized "someone else
//                             is here too" discovery at the same spot.
//   • Discover (/discover)  — open-table plans you can ask to join, plus people
//                             discovery (friends-of-friends with shared interests).
//   • People (/people)      — connections + availability signals.
//   • Boards (/boards/…)    — a neighborhood board you're a member of.
//   • Mutual (/mutual)      — a completed mutual match (with its plan room).
//   • Matchmaker            — a friend introducing you to someone.
//
// WHY it targets a specific account: the map and most feeds are RLS-scoped.
// Zones are world-readable, but a plan is only visible to its host or a *sent*
// invitee, and a moment is owner-only. So the script finds your real profile by
// email and makes you the host / invitee / owner of the right rows.
//
// WHAT THE MAP WILL ACTUALLY SHOW, and why the counts differ per layer:
//   • Zones      — every anchored zone below (world-readable).
//   • Plans      — plans you host or were *sent* an invite to.
//   • Live       — mutual: you see other sharers only while YOU are sharing.
//                  The seed shares on your behalf so the layer isn't empty; it
//                  expires (see SEED_LIVE_HOURS) and "Stop" on /map ends it.
//   • Shared places — YOUR OWN check-ins only (`moments` is owner-only), and the
//                  app allows one open check-in at a time, so this layer is 1.
//                  Other people's check-ins surface as zone presence and as
//                  anonymized "someone's here too" candidates, not as pins.
//
// Usage (against your hosted Supabase project):
//
//   SEED_ALLOW_NONLOCAL=1 \
//   SEED_VIEWER_EMAIL=you@example.com \
//   npm run seed:discovery-demo
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env
// (or .env.local). SEED_VIEWER_EMAIL defaults to the repo owner's email. The
// viewer must have signed into the app at least once so their account exists.
// SEED_LIVE_HOURS (1–8, default 8) sets how long the seeded live presence lasts.
//
// Idempotent: it owns a fixed set of demo rows (the mock accounts below, the
// listed zone slugs / board slug, and any viewer-owned rows tagged with the
// marker) and clears just those before re-inserting. Re-run it freely — and
// re-run it to refresh live presence once it has expired.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const viewerEmail = (process.env.SEED_VIEWER_EMAIL ?? 'tennysontaggart@gmail.com').toLowerCase();
const password = process.env.SEED_TEST_PASSWORD ?? 'switchboard-test-123';
const domain = 'discovery.switchboard.local';

// Mirrors the app's own clamp (MIN_HOURS/MAX_HOURS in lib/actions/live-location):
// seeded presence must not outlive what a real person could choose for themselves.
const liveHours = Math.min(8, Math.max(1, Math.round(Number(process.env.SEED_LIVE_HOURS ?? 8)) || 8));

// A hidden marker stamped into the description of viewer-owned demo rows so a
// re-run can find and replace exactly those, never the viewer's real plans.
const MARKER = '[seed:discovery-demo]';

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to your environment or .env.local.',
  );
  process.exit(1);
}

// Safety guard mirrors seed-test-profiles: these fixture accounts share a
// repo-visible default password, so refuse a hosted project unless the operator
// explicitly opts in (and, ideally, sets a strong SEED_TEST_PASSWORD).
const isLocal = /localhost|127\.0\.0\.1|::1/.test(url);
if (!isLocal && process.env.SEED_ALLOW_NONLOCAL !== '1') {
  console.error(
    `Refusing to seed against a non-local Supabase (${url}).\n` +
      'This demo must target the project your personal account lives in, so set\n' +
      'SEED_ALLOW_NONLOCAL=1 to confirm, and prefer a strong SEED_TEST_PASSWORD.',
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ————————————————————————— time + geo helpers —————————————————————————
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const now = Date.now();
/** ISO timestamp `days` days (and optional `hours`) from now, at a wall time. */
function at(days, hour = 18, minute = 0) {
  const d = new Date(now + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
/** ISO timestamp `h` hours from now (for short-lived signals / moments). */
function inHours(h) {
  return new Date(now + h * HOUR).toISOString();
}

// Real-ish Salt Lake City venues, spread across the valley so the map reads as
// populated rather than a single stack of pins. Downtown is ~40.766, -111.891;
// the live-location default radius is 5 km ("Nearby") and the widest is 25 km
// ("Around town"), so Sandy and Millcreek Canyon below are deliberately outside
// the default — they make the radius control mean something.
const SLC = {
  publik: { name: 'Publik Coffee Roasters', address: '975 S West Temple, Salt Lake City', lat: 40.7501, lng: -111.8931 },
  libertyPark: { name: 'Liberty Park', address: '600 E 900 S, Salt Lake City', lat: 40.7466, lng: -111.8747 },
  pioneerPark: { name: 'Pioneer Park', address: '350 W 300 S, Salt Lake City', lat: 40.7642, lng: -111.9012 },
  gallivan: { name: 'Gallivan Center', address: '239 S Main St, Salt Lake City', lat: 40.7663, lng: -111.8887 },
  hsl: { name: 'HSL Restaurant', address: '418 E 200 S, Salt Lake City', lat: 40.7669, lng: -111.879 },
  sugarHousePark: { name: 'Sugar House Park', address: '1330 E 2100 S, Salt Lake City', lat: 40.7248, lng: -111.8583 },
  ensignPeak: { name: 'Ensign Peak Trailhead', address: '780 N Ensign Vista Dr, Salt Lake City', lat: 40.793, lng: -111.879 },
  theFront: { name: 'The Front Climbing Club', address: '1470 S 400 W, Salt Lake City', lat: 40.7208, lng: -111.9007 },
  avenues: { name: 'The Avenues', address: '2nd Ave & E St, Salt Lake City', lat: 40.776, lng: -111.87 },
  redButte: { name: 'Red Butte Garden', address: '300 Wakara Way, Salt Lake City', lat: 40.7663, lng: -111.826 },
  cityLibrary: { name: 'Salt Lake City Public Library', address: '210 E 400 S, Salt Lake City', lat: 40.7583, lng: -111.8863 },
  trolleySquare: { name: 'Trolley Square', address: '600 S 700 E, Salt Lake City', lat: 40.7531, lng: -111.8709 },
  ninthAndNinth: { name: '9th & 9th', address: '900 E 900 S, Salt Lake City', lat: 40.7503, lng: -111.8646 },
  fisherBrewing: { name: 'Fisher Brewing Co.', address: '320 W 800 S, Salt Lake City', lat: 40.7523, lng: -111.9019 },
  marmalade: { name: 'Marmalade Library', address: '280 W 500 N, Salt Lake City', lat: 40.7772, lng: -111.9018 },
  rosePark: { name: 'Rose Park Lane', address: '1386 N Rose Park Ln, Salt Lake City', lat: 40.7936, lng: -111.9339 },
  jordanRiver: { name: 'Jordan River Parkway', address: '1000 S 1200 W, Salt Lake City', lat: 40.7462, lng: -111.9244 },
  umfa: { name: 'Utah Museum of Fine Arts', address: '410 Campus Center Dr, Salt Lake City', lat: 40.7597, lng: -111.8412 },
  emigration: { name: 'Emigration Canyon', address: 'Emigration Canyon Rd, Salt Lake City', lat: 40.7645, lng: -111.7902 },
  holladay: { name: 'Holladay Village Plaza', address: '4580 S 2300 E, Holladay', lat: 40.669, lng: -111.825 },
  millcreekCanyon: { name: 'Millcreek Canyon Trailhead', address: 'Millcreek Canyon Rd, Salt Lake City', lat: 40.695, lng: -111.796 },
  sandy: { name: 'Sandy Town Center', address: '10450 S State St, Sandy', lat: 40.571, lng: -111.879 },
  ballpark: { name: 'Smith’s Ballpark', address: '77 W 1300 S, Salt Lake City', lat: 40.7181, lng: -111.8925 },
};

// ————————————————————————— mock cast —————————————————————————
// friend: connected to the viewer (powers signals, boards, viewer-visible plans)
// otherwise: discoverable but NOT connected to the viewer, so People Discovery
// has friends-of-friends to surface.
//
// `live` puts the person on the map's Live layer. Discovery is mutual and
// scoped, so: 'connections' visibility is only ever given to friends (a stranger
// set to 'connections' is invisible to the viewer, which reads as a bug rather
// than as the feature it is), and the cluster sits inside the 5 km default with
// a deliberate handful further out.
const CAST = [
  { key: 'mara', handle: 'mara_slc', name: 'Mara Fielding', friend: true, area: 'Sugar House, SLC',
    interests: ['dinner', 'live_music', 'board_games'], down_to: ['coffee', 'dinner', 'trivia'],
    live: { lat: 40.7527, lng: -111.862, headline: 'Working from 9th & 9th', emoji: '💻', visibility: 'connections' } },
  { key: 'leo', handle: 'leo_slc', name: 'Leo Whitfield', friend: true, area: '9th & 9th, SLC',
    interests: ['coffee', 'books', 'cycling'], down_to: ['coffee', 'walk', 'bookstore'],
    live: { lat: 40.7642, lng: -111.9012, headline: 'At the farmers market', emoji: '🧺' } },
  { key: 'nina', handle: 'nina_slc', name: 'Nina Delgado', friend: true, area: 'Downtown, SLC',
    interests: ['live_music', 'dancing', 'food_trucks'], down_to: ['concert', 'dancing', 'drinks'],
    live: { lat: 40.7663, lng: -111.8887, headline: 'Coffee downtown', emoji: '☕' } },
  { key: 'omar', handle: 'omar_slc', name: 'Omar Reyes', friend: true, area: 'The Avenues, SLC',
    interests: ['board_games', 'trivia', 'climbing'], down_to: ['game_night', 'trivia', 'climbing'],
    live: { lat: 40.7755, lng: -111.8705, headline: 'Bouldering later, say hi', emoji: '🧗', visibility: 'connections' } },
  { key: 'june', handle: 'june_slc', name: 'June Halvorsen', friend: true, area: 'Capitol Hill, SLC',
    interests: ['hiking', 'coffee', 'photography'], down_to: ['hike', 'coffee', 'sunrise'],
    live: { lat: 40.7772, lng: -111.9018, headline: 'Sunrise walk, then coffee', emoji: '🌄' } },
  { key: 'tobias', handle: 'tobias_slc', name: 'Tobias Kane', friend: true, area: 'Central 9th, SLC',
    interests: ['dinner', 'cooking', 'board_games'], down_to: ['dinner', 'game_night', 'drinks'],
    live: { lat: 40.7523, lng: -111.9019, headline: 'Pint at Fisher, one seat free', emoji: '🍺' } },
  { key: 'rosa', handle: 'rosa_slc', name: 'Rosa Iglesias', friend: true, area: 'Rose Park, SLC',
    interests: ['cycling', 'parks', 'live_music'], down_to: ['bike_ride', 'walk', 'concert'],
    live: { lat: 40.7936, lng: -111.9339, headline: 'Riding the river trail', emoji: '🚲' } },
  { key: 'dev', handle: 'dev_slc', name: 'Dev Bhatt', friend: true, area: 'University, SLC',
    interests: ['books', 'coffee', 'trivia'], down_to: ['coffee', 'trivia', 'museum'],
    live: { lat: 40.7597, lng: -111.8412, headline: 'Museum then coffee?', emoji: '🖼️' } },
  { key: 'ivy', handle: 'ivy_slc', name: 'Ivy Sorenson', friend: false, area: 'Millcreek, SLC',
    interests: ['hiking', 'parks', 'farmers_market'], down_to: ['hike', 'picnic', 'walk'],
    live: { lat: 40.7466, lng: -111.8747, headline: 'Walking the Liberty Park loop', emoji: '🚶' } },
  { key: 'sam', handle: 'sam_slc', name: 'Sam Okoye', friend: false, area: 'Liberty Wells, SLC',
    interests: ['coffee', 'photography', 'live_music'], down_to: ['coffee', 'gallery', 'concert'],
    live: { lat: 40.736, lng: -111.876, headline: 'Shooting film around the block', emoji: '📷' } },
  { key: 'priya', handle: 'priya_slc', name: 'Priya Nair', friend: false, area: 'Marmalade, SLC',
    interests: ['cooking', 'live_music', 'hiking'], down_to: ['coffee', 'dinner', 'concert'],
    live: { lat: 40.779, lng: -111.902, headline: 'Trying the new coffee spot', emoji: '☕' } },
  { key: 'hana', handle: 'hana_slc', name: 'Hana Lindqvist', friend: false, area: 'Sugar House, SLC',
    interests: ['board_games', 'books', 'dinner'], down_to: ['game_night', 'bookstore', 'dinner'],
    live: { lat: 40.7248, lng: -111.8583, headline: 'Reading in the park', emoji: '📚' } },
  { key: 'cal', handle: 'cal_slc', name: 'Cal Merrick', friend: false, area: 'Granary District, SLC',
    interests: ['climbing', 'cycling', 'live_music'], down_to: ['climbing', 'bike_ride', 'drinks'],
    live: { lat: 40.7208, lng: -111.9007, headline: 'Session at The Front', emoji: '🧗' } },
  { key: 'wren', handle: 'wren_slc', name: 'Wren Adeyemi', friend: false, area: 'Downtown, SLC',
    interests: ['dancing', 'live_music', 'food_trucks'], down_to: ['dancing', 'concert', 'drinks'],
    live: { lat: 40.7583, lng: -111.8863, headline: 'Library, then something loud', emoji: '🎧' } },
  { key: 'mateo', handle: 'mateo_slc', name: 'Mateo Salas', friend: false, area: 'Glendale, SLC',
    interests: ['parks', 'cycling', 'cooking'], down_to: ['walk', 'bike_ride', 'picnic'],
    live: { lat: 40.7462, lng: -111.9244, headline: 'Jordan River loop', emoji: '🌳' } },
  { key: 'kit', handle: 'kit_slc', name: 'Kit Brennan', friend: false, area: 'Trolley Square, SLC',
    interests: ['coffee', 'board_games', 'trivia'], down_to: ['coffee', 'trivia', 'game_night'],
    live: { lat: 40.7531, lng: -111.8709, headline: 'Trivia team needs a fourth', emoji: '🎲' } },
  { key: 'nadia', handle: 'nadia_slc', name: 'Nadia Rahimi', friend: false, area: 'Holladay, UT',
    interests: ['hiking', 'dinner', 'farmers_market'], down_to: ['hike', 'dinner', 'coffee'],
    live: { lat: 40.669, lng: -111.825, headline: 'Holladay village errands', emoji: '🥕' } },
  { key: 'felix', handle: 'felix_slc', name: 'Felix Ostrander', friend: false, area: 'Emigration, SLC',
    interests: ['hiking', 'cycling', 'photography'], down_to: ['hike', 'trail_run', 'bike_ride'],
    live: { lat: 40.7645, lng: -111.7902, headline: 'Canyon climb, back by noon', emoji: '⛰️' } },
  // Deliberately outside the 5 km default radius: Thea only appears once the
  // viewer widens "Show people" to Around town.
  { key: 'thea', handle: 'thea_slc', name: 'Thea Nakamura', friend: false, area: 'Sandy, UT',
    interests: ['dinner', 'board_games', 'live_music'], down_to: ['dinner', 'game_night', 'concert'],
    live: { lat: 40.571, lng: -111.879, headline: 'South valley all day', emoji: '🚗' } },
  // No `live` entry: someone discoverable who simply isn't sharing right now.
  { key: 'jonah', handle: 'jonah_slc', name: 'Jonah Weiss', friend: false, area: 'Ballpark, SLC',
    interests: ['live_music', 'books', 'coffee'], down_to: ['concert', 'coffee', 'bookstore'] },
];

// ————————————————————————— zones —————————————————————————
// Every zone is anchored to a point, because an unanchored zone can never
// appear on the map — and a Zones count you can't get to is the whole reason
// the map's directory exists. `presence` lists the cast keys checked in there.
const ZONES = [
  { slug: 'liberty-park-serendipity', name: 'Liberty Park Serendipity', organizer: 'mara',
    description: 'Sunny afternoons at the park — picnics, frisbee, and easy hellos.',
    experiences: ['picnic', 'frisbee', 'people_watching'], v: SLC.libertyPark,
    presence: ['ivy', 'sam', 'mateo'] },
  { slug: 'downtown-farmers-serendipity', name: 'Downtown Farmers Serendipity', organizer: 'leo',
    description: 'Saturday market wanderers — coffee, produce, and live music.',
    experiences: ['coffee', 'market', 'live_music'], v: SLC.pioneerPark,
    presence: ['leo', 'priya', 'wren', 'jonah'] },
  { slug: 'sugar-house-evenings', name: 'Sugar House Evenings', organizer: 'nina',
    description: 'After-work drinks and dinner around Sugar House.',
    experiences: ['dinner', 'drinks', 'dancing'], v: SLC.sugarHousePark,
    presence: ['hana', 'thea'] },
  { slug: 'avenues-morning-walks', name: 'Avenues Morning Walks', organizer: 'omar',
    description: 'Early risers walking the Avenues grid with dogs and coffee.',
    experiences: ['walk', 'coffee', 'dogs'], v: SLC.avenues,
    presence: ['omar', 'june'] },
  { slug: 'red-butte-trailheads', name: 'Red Butte Trailheads', organizer: 'ivy',
    description: 'Trail runners and hikers meeting at the foothills.',
    experiences: ['hike', 'trail_run', 'birding'], v: SLC.redButte,
    presence: ['felix', 'dev'] },
  { slug: 'granary-climb-nights', name: 'Granary Climb Nights', organizer: 'omar',
    description: 'Bouldering after work at The Front, then tacos across the street.',
    experiences: ['climbing', 'tacos', 'beer'], v: SLC.theFront,
    presence: ['cal'] },
  { slug: 'city-library-quiet-hours', name: 'City Library Quiet Hours', organizer: 'dev',
    description: 'Working alone, together — the fourth floor by the windows.',
    experiences: ['coworking', 'reading', 'coffee'], v: SLC.cityLibrary,
    presence: ['kit', 'wren'] },
  { slug: 'jordan-river-rides', name: 'Jordan River Rides', organizer: 'rosa',
    description: 'Flat, shaded, and easy — a ride anyone can hold a conversation on.',
    experiences: ['bike_ride', 'walk', 'birding'], v: SLC.jordanRiver,
    presence: ['rosa'] },
  { slug: 'holladay-village-evenings', name: 'Holladay Village Evenings', organizer: 'mara',
    description: 'South valley meetups, so nobody has to drive downtown.',
    experiences: ['dinner', 'coffee', 'walk'], v: SLC.holladay,
    presence: ['nadia'] },
];

// Where each checked-in person is standing, so a zone check-in also reads as a
// real place. Falls back to the zone's own anchor.
const PRESENCE_HEADLINES = {
  ivy: 'Lap of the park, then the greenhouse',
  sam: 'Shooting the bandstand while the light holds',
  mateo: 'Picnic blanket by the tennis courts',
  leo: 'Queue at the coffee cart — say hi',
  priya: 'Buying more peaches than I can carry',
  wren: 'Following the busker down the row',
  jonah: 'Second lap, still no plan',
  hana: 'Reading under the big tree',
  thea: 'Down from Sandy for the evening',
  omar: 'Walking the grid, dog in tow',
  june: 'Coffee first, opinions after',
  felix: 'Trailhead at the top of the loop',
  dev: 'Garden bench with a book',
  cal: 'Warming up on the slab wall',
  kit: 'Fourth floor, by the windows',
  rosa: 'Riding north, turning around at 1000 N',
  nadia: 'Village plaza, killing an hour',
};

// ————————————————————————— user lookup / upsert —————————————————————————
async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function upsertMock(person) {
  const email = `${person.handle}@${domain}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: person.name, username: person.handle },
  });
  if (createError && !/already|registered|exists/i.test(createError.message)) throw createError;

  let user = created?.user ?? null;
  if (!user) user = await findUserByEmail(email);
  if (!user) throw new Error(`Could not find or create ${email}`);

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      display_name: person.name,
      handle: person.handle,
      location: person.area,
      tagline: `${person.area.split(',')[0]} · up for ${person.down_to[0]}`,
      interests: person.interests,
      down_to: person.down_to,
      timezone: 'America/Denver',
      onboarded: true,
      discoverable: true,
      discovery_interests: true,
      discovery_mutuals: true,
      discovery_geography: true,
    })
    .eq('id', user.id);
  if (profileError) throw profileError;
  return user.id;
}

// One accepted connection row is enough — are_connected() checks both directions.
async function connect(aId, bId) {
  const { error } = await admin
    .from('connections')
    .upsert({ requester_id: aId, addressee_id: bId, status: 'accepted' }, { onConflict: 'requester_id,addressee_id' });
  if (error) throw error;
}

function delIn(table, column, values) {
  if (!values.length) return Promise.resolve();
  return admin.from(table).delete().in(column, values);
}

// ————————————————————————— run —————————————————————————
const viewer = await findUserByEmail(viewerEmail);
if (!viewer) {
  console.error(
    `No account found for ${viewerEmail}. Sign into the app once with that email\n` +
      '(so the profile exists), or pass SEED_VIEWER_EMAIL=<your email>.',
  );
  process.exit(1);
}
const viewerId = viewer.id;
console.log(`Seeding discovery demo for viewer ${viewerEmail} (${viewerId})`);
console.log(`Creating / refreshing ${CAST.length} mock accounts…`);

// 1) Mock cast + social graph.
const ids = {};
for (const person of CAST) ids[person.key] = await upsertMock(person);
const mockIds = Object.values(ids);
const friendIds = CAST.filter((p) => p.friend).map((p) => ids[p.key]);

// Viewer <-> friends. Strangers connect only to friends (shared mutuals, but
// not to the viewer — so People Discovery surfaces them as friends-of-friends).
for (const fId of friendIds) await connect(viewerId, fId);
for (const [a, b] of [
  ['mara', 'leo'], ['ivy', 'leo'], ['ivy', 'mara'], ['sam', 'nina'], ['sam', 'mara'],
  ['priya', 'omar'], ['priya', 'nina'], ['hana', 'mara'], ['hana', 'tobias'],
  ['cal', 'omar'], ['cal', 'rosa'], ['wren', 'nina'], ['wren', 'dev'],
  ['mateo', 'rosa'], ['mateo', 'june'], ['kit', 'tobias'], ['kit', 'omar'],
  ['nadia', 'mara'], ['nadia', 'june'], ['felix', 'june'], ['felix', 'dev'],
  ['thea', 'tobias'], ['thea', 'nina'], ['jonah', 'leo'], ['jonah', 'rosa'],
]) {
  await connect(ids[a], ids[b]);
}

// Give the viewer a discovery-ready profile without clobbering real identity:
// only fill interests/down_to if empty, and set location + discovery opt-ins.
{
  const { data: me } = await admin
    .from('profiles')
    .select('interests, down_to, location')
    .eq('id', viewerId)
    .single();
  const patch = {
    timezone: 'America/Denver',
    onboarded: true,
    discoverable: true,
    discovery_interests: true,
    discovery_mutuals: true,
    discovery_geography: true,
  };
  if (!me?.location) patch.location = 'Salt Lake City, UT';
  if (!me?.interests?.length) patch.interests = ['coffee', 'live_music', 'hiking', 'board_games', 'dinner'];
  if (!me?.down_to?.length) patch.down_to = ['coffee', 'dinner', 'hike', 'trivia', 'concert'];
  const { error } = await admin.from('profiles').update(patch).eq('id', viewerId);
  if (error) throw error;
}

// 2) Clear anything this script previously owned (children first).
{
  // Mutual matches involving the viewer + a mock, and their match rooms.
  const { data: demoMatches } = await admin
    .from('matches')
    .select('id, room_id, user_a, user_b')
    .or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`);
  const mine = (demoMatches ?? []).filter((m) => mockIds.includes(m.user_a) || mockIds.includes(m.user_b));
  await delIn('matches', 'id', mine.map((m) => m.id));
  await delIn('rooms', 'id', mine.map((m) => m.room_id).filter(Boolean)); // room_members cascade
  await delIn('mutual_intents', 'author_id', mockIds);
  await delIn('mutual_intents', 'target_id', mockIds);
  await delIn('matchmaker_proposals', 'proposer_id', mockIds);
  await delIn('matchmaker_proposals', 'person_a', mockIds);
  await delIn('matchmaker_proposals', 'person_b', mockIds);

  await delIn('availability_signals', 'user_id', mockIds);
  await delIn('live_locations', 'user_id', mockIds);
  await delIn('moments', 'user_id', mockIds);
  // The viewer's own demo check-in, identified by the places this script uses.
  // Moments are ephemeral by design, so name-matching is safe enough here — and
  // there is no description column to hide the marker in.
  await admin
    .from('moments')
    .delete()
    .eq('user_id', viewerId)
    .in('place_name', [SLC.publik.name, SLC.libertyPark.name, ...ZONES.map((z) => z.v.name)]);
  await delIn('events', 'host_id', mockIds); // invites/polls cascade
  await admin.from('events').delete().eq('host_id', viewerId).like('description', `%${MARKER}%`);
  // Derived from ZONES so adding a zone can never leave an orphan behind.
  await admin.from('zones').delete().in('slug', ZONES.map((z) => z.slug));
  await admin.from('boards').delete().eq('slug', 'sugar-house-neighbors'); // members/posts cascade
  // Venue perks this script created (scoped to demo owners so real venues stay).
  await admin
    .from('venues')
    .delete()
    .in('claimed_by', mockIds)
    .in('name', ['Publik Coffee Roasters', 'Fisher Brewing Co.', 'The Rose Establishment', 'Pago']);
}

// 3) Zones — public serendipity zones (everyone sees these on the map).
{
  const { error } = await admin.from('zones').insert(
    ZONES.map((z) => ({
      slug: z.slug, name: z.name, organizer_id: ids[z.organizer], description: z.description,
      experiences: z.experiences, starts_at: at(0, 8), ends_at: at(21, 22),
      latitude: z.v.lat, longitude: z.v.lng,
    })),
  );
  if (error) throw error;
}
const { data: zoneRows } = await admin.from('zones').select('id, slug').in('slug', ZONES.map((z) => z.slug));
const zoneIdBySlug = Object.fromEntries((zoneRows ?? []).map((z) => [z.slug, z.id]));

// 4) Events. Insert, then attach invites so RLS + feeds behave.
async function makeEvent(evt, invites) {
  const { data, error } = await admin
    .from('events')
    .insert({
      host_id: evt.host, title: evt.title, description: `${evt.description} ${evt.viewerOwned ? MARKER : ''}`.trim(),
      location_name: evt.v.name, location_address: evt.v.address,
      latitude: evt.v.lat, longitude: evt.v.lng,
      starts_at: evt.starts_at, ends_at: evt.ends_at, time_zone: 'America/Denver',
      capacity: evt.capacity ?? null, invite_mode: evt.invite_mode ?? 'group',
      open_table: evt.open_table ?? false, status: evt.status, show_accepted: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  const eventId = data.id;
  if (invites?.length) {
    const { error: inviteError } = await admin.from('invites').insert(
      invites.map((inv, i) => ({
        event_id: eventId, invitee_id: inv.id, position: i,
        status: inv.status,
        sent_at: inv.status === 'queued' ? null : new Date(now - HOUR).toISOString(),
        responded_at: inv.status === 'accepted' ? new Date(now - 30 * 60 * 1000).toISOString() : null,
      })),
    );
    if (inviteError) throw inviteError;
  }
  return eventId;
}

// 4a) Viewer-hosted plans → show on the viewer's Map (Plans) + plans list.
await makeEvent(
  { host: viewerId, viewerOwned: true, title: 'Sunday Coffee at Publik', description: 'Slow morning, good espresso.',
    v: SLC.publik, starts_at: at(2, 10), ends_at: at(2, 12), status: 'confirmed', capacity: 6 },
  [{ id: ids.leo, status: 'accepted' }, { id: ids.mara, status: 'sent' }, { id: ids.june, status: 'sent' }],
);
await makeEvent(
  { host: viewerId, viewerOwned: true, title: 'Board Game Night', description: 'BYO snacks, we supply the games.',
    v: SLC.avenues, starts_at: at(5, 19), ends_at: at(5, 22), status: 'inviting', capacity: 8 },
  [{ id: ids.omar, status: 'accepted' }, { id: ids.nina, status: 'sent' }, { id: ids.tobias, status: 'accepted' }],
);
await makeEvent(
  { host: viewerId, viewerOwned: true, title: 'Trail + Tacos', description: 'Ensign Peak at sunrise, tacos after.',
    v: SLC.ensignPeak, starts_at: at(9, 8), ends_at: at(9, 11), status: 'confirmed', capacity: 5 },
  [{ id: ids.ivy, status: 'accepted' }, { id: ids.june, status: 'accepted' }],
);

// 4b) Friend-hosted plans that INVITE the viewer (status 'sent') → also visible
//     on the viewer's Map + shows as an incoming invite.
await makeEvent(
  { host: ids.mara, title: 'Dinner at HSL', description: 'Tasting menu, split the table.',
    v: SLC.hsl, starts_at: at(3, 19), ends_at: at(3, 22), status: 'inviting', capacity: 6 },
  [{ id: viewerId, status: 'sent' }, { id: ids.leo, status: 'accepted' }],
);
await makeEvent(
  { host: ids.nina, title: 'Twilight Concert', description: 'Free show on the plaza — grab a spot early.',
    v: SLC.gallivan, starts_at: at(6, 20), ends_at: at(6, 22, 30), status: 'confirmed', capacity: 10 },
  [{ id: viewerId, status: 'sent' }, { id: ids.omar, status: 'accepted' }, { id: ids.wren, status: 'accepted' }],
);
await makeEvent(
  { host: ids.rosa, title: 'River Trail Ride', description: 'Flat and easy, coffee at the turnaround.',
    v: SLC.jordanRiver, starts_at: at(4, 17), ends_at: at(4, 19), status: 'confirmed', capacity: 8 },
  [{ id: viewerId, status: 'sent' }, { id: ids.mateo, status: 'accepted' }],
);
await makeEvent(
  { host: ids.dev, title: 'Museum Hour + Coffee', description: 'The new exhibit, then somewhere to argue about it.',
    v: SLC.umfa, starts_at: at(8, 16), ends_at: at(8, 18), status: 'inviting', capacity: 6 },
  [{ id: viewerId, status: 'sent' }, { id: ids.felix, status: 'accepted' }],
);

// 4c) Open-table plans (friend-hosted, viewer NOT invited) → surface in Discover
//     via list_open_tables(): open_table, capacity set, a friend accepted.
await makeEvent(
  { host: ids.leo, title: 'Saturday Farmers Market Meetup', description: 'Coffee at the market, then wander the stalls.',
    v: SLC.pioneerPark, starts_at: at(4, 9), ends_at: at(4, 11), status: 'inviting', capacity: 10, open_table: true },
  [{ id: ids.omar, status: 'accepted' }, { id: ids.mara, status: 'accepted' }],
);
await makeEvent(
  { host: ids.omar, title: 'Climbing @ The Front', description: 'Bouldering session, all levels welcome.',
    v: SLC.theFront, starts_at: at(7, 18), ends_at: at(7, 20), status: 'confirmed', capacity: 8, open_table: true },
  [{ id: ids.mara, status: 'accepted' }, { id: ids.cal, status: 'accepted' }],
);
await makeEvent(
  { host: ids.tobias, title: 'Trivia at Fisher', description: 'Team of six, we have four. No specialist knowledge required.',
    v: SLC.fisherBrewing, starts_at: at(2, 19), ends_at: at(2, 21, 30), status: 'confirmed', capacity: 6, open_table: true },
  [{ id: ids.kit, status: 'accepted' }, { id: ids.hana, status: 'accepted' }],
);

// 5) Moments — the viewer's own "shared place" plus mock check-ins.
//
//    The app allows ONE open moment per person (checkIn() closes any previous
//    one), so the seed does too: a fixture that breaks the product's own rule
//    teaches the wrong thing about what the app does. That means the viewer's
//    "Shared places" layer is a single pin — everyone else's check-ins surface
//    as zone presence and as anonymized "someone's here too" candidates.
async function makeMoment(userId, v, experiences, headline, hours, zoneId = null) {
  const { error } = await admin.from('moments').insert({
    user_id: userId, place_name: v.name, experiences, headline,
    latitude: v.lat, longitude: v.lng, available_until: inHours(hours), status: 'open',
    zone_id: zoneId,
  });
  if (error) throw error;
}
// The viewer is at Publik; Mara is too, so find_shared_moments() has an
// anonymized "someone else is here" candidate to offer at that exact place.
await makeMoment(viewerId, SLC.publik, ['coffee', 'coworking'], 'Working from Publik till 2', 6);
await makeMoment(ids.mara, SLC.publik, ['coffee', 'books'], 'Latte + a good book', 5);

// Zone check-ins → the zone pages stop saying "be the first" and start saying
// who's around (via zone_presence).
const checkedIn = new Set([ids.mara]);
for (const zone of ZONES) {
  for (const key of zone.presence) {
    if (checkedIn.has(ids[key])) continue; // one open moment per person
    checkedIn.add(ids[key]);
    await makeMoment(
      ids[key],
      zone.v,
      zone.experiences.slice(0, 2),
      PRESENCE_HEADLINES[key] ?? `Around ${zone.name}`,
      3 + (zone.presence.indexOf(key) % 4),
      zoneIdBySlug[zone.slug],
    );
  }
}

// 6) Availability signals from friends → visible to the viewer on /people.
{
  const signals = [
    { user: ids.mara, emoji: '☕', label: 'Coffee break?', hours: 3 },
    { user: ids.leo, emoji: '🚶', label: 'Free for a walk', hours: 2 },
    { user: ids.nina, emoji: '🍸', label: 'Drinks later?', hours: 6 },
    { user: ids.omar, emoji: '🎲', label: 'Game night tonight', hours: 8 },
    { user: ids.june, emoji: '🌄', label: 'Sunrise hike tomorrow', hours: 12 },
    { user: ids.tobias, emoji: '🍜', label: 'Someone eat dinner with me', hours: 4 },
    { user: ids.rosa, emoji: '🚲', label: 'Easy ride, any pace', hours: 5 },
    { user: ids.dev, emoji: '📚', label: 'Bookstore wander?', hours: 7 },
  ];
  const { error } = await admin.from('availability_signals').insert(
    signals.map((s) => ({ user_id: s.user, emoji: s.emoji, label: s.label, expires_at: inHours(s.hours) })),
  );
  if (error) throw error;
}

// 6b) Venue perks → the "Perks near you" strip on Discover. As of the venue-review
//     migration a venue is only world-visible once status = 'verified', so the
//     demo rows are seeded pre-verified (service role bypasses the moderator gate).
await admin.from('venues').insert(
  [
    { name: 'Publik Coffee Roasters', area: 'West Temple', claimed_by: ids.leo,
      perk: '10% off pour-overs when you check in with a Switchboard plan.' },
    { name: 'Fisher Brewing Co.', area: 'Granary District', claimed_by: ids.omar,
      perk: 'First round on the house for open-table groups of 4+.' },
    { name: 'The Rose Establishment', area: 'Downtown', claimed_by: ids.nina,
      perk: 'Free pastry with any coffee on weekday mornings.' },
    { name: 'Pago', area: '9th & 9th', claimed_by: ids.mara,
      perk: 'Complimentary small plate for dinner plans booked here.' },
  ].map((v) => ({ ...v, status: 'verified', reviewed_at: new Date(now - DAY).toISOString() })),
);

// 6c) Live location — opt-in "who's sharing nearby" presence. Discovery is mutual
//     (find_nearby_people returns rows only to a caller who is themselves sharing)
//     and defaults to a 5 km radius, so the viewer gets a live point downtown and
//     the cast is clustered around it. All time-boxed (SEED_LIVE_HOURS, ≤ 8 h).
const share = (userId, lat, lng, headline, emoji, visibility = 'sharers') =>
  admin.from('live_locations').upsert(
    {
      user_id: userId, latitude: lat, longitude: lng, accuracy_m: 30,
      headline, emoji, visibility, updated_at: new Date().toISOString(), expires_at: inHours(liveHours),
    },
    { onConflict: 'user_id' },
  );
// The viewer shares too, so "see and be seen" is satisfied and the Live layer
// isn't empty. (It's their own ephemeral row — "Stop" on /map ends it anytime.)
await share(viewerId, 40.766, -111.891, 'Downtown for the afternoon', '📍');
const sharing = CAST.filter((p) => p.live);
for (const person of sharing) {
  const { error } = await share(
    ids[person.key], person.live.lat, person.live.lng,
    person.live.headline, person.live.emoji, person.live.visibility ?? 'sharers',
  );
  if (error) throw error;
}

// 7) Neighborhood board the viewer belongs to.
{
  const { data: board, error } = await admin
    .from('boards')
    .insert({ slug: 'sugar-house-neighbors', name: 'Sugar House Neighbors',
      description: 'Notices, meetups, and recurring open events around Sugar House.', created_by: ids.mara })
    .select('id')
    .single();
  if (error) throw error;
  await admin.from('board_members').insert([
    { board_id: board.id, member_id: ids.mara, role: 'moderator' },
    { board_id: board.id, member_id: viewerId, role: 'member' },
    ...['leo', 'nina', 'omar', 'june', 'tobias', 'rosa', 'dev', 'hana', 'kit'].map((key) => ({
      board_id: board.id, member_id: ids[key], role: 'member',
    })),
  ]);
  await admin.from('board_posts').insert([
    { board_id: board.id, author_id: ids.mara, kind: 'notice',
      title: 'Little Free Library restocked', body: 'Fresh stack of novels at 9th East & Ramona.',
      location: '9th East & Ramona Ave' },
    { board_id: board.id, author_id: ids.leo, kind: 'event',
      title: 'Saturday morning run club', body: 'Easy 3 miles, coffee after. All paces.',
      location: SLC.sugarHousePark.name, cadence: 'Every Saturday, 7am', starts_at: at(4, 7) },
    { board_id: board.id, author_id: ids.nina, kind: 'notice',
      title: 'Anyone else hear the concerts from Sugar House Park?', body: 'Summer series kicks off this week.' },
    { board_id: board.id, author_id: ids.kit, kind: 'event',
      title: 'Trivia team, permanently one short', body: 'Tuesdays at Fisher. No specialist knowledge required.',
      location: SLC.fisherBrewing.name, cadence: 'Every Tuesday, 7pm', starts_at: at(2, 19) },
  ]);
}

// 8) A completed Mutual match between the viewer and a stranger. Inserting both
//    intents fires the security-definer trigger, which creates the match + room.
{
  await admin.from('mutual_intents').insert({
    author_id: ids.priya, target_id: viewerId, activity: 'coffee', kind: 'discover_connect', status: 'active',
  });
  await admin.from('mutual_intents').insert({
    author_id: viewerId, target_id: ids.priya, activity: 'coffee', kind: 'discover_connect', status: 'active',
  });
}

// 9) A third-party introduction waiting on the viewer. Mara is connected to both
//    sides, which is what the matchmaker insert policy requires of a real user.
{
  const { error } = await admin.from('matchmaker_proposals').insert({
    proposer_id: ids.mara, person_a: viewerId, person_b: ids.hana,
    activity: 'board games', note: 'You two would not stop talking. Trust me.',
  });
  if (error) throw error;
}

console.log('\nDiscovery demo seeded. Sign in as', viewerEmail, 'and explore:');
console.log(`  • /map        — ${ZONES.length} zones, ${sharing.length + 1} people sharing live, plans across the valley.`);
console.log('                  Tap anything in "What’s on the map" to fly straight to it.');
console.log(`  • /zones      — ${ZONES.length} public serendipity zones, each with people checked in`);
console.log('  • /moments    — your place + "someone else is here too" at Publik');
console.log('  • /discover   — 3 open tables to join + people to meet');
console.log('  • /people     — friends + 8 live availability signals');
console.log('  • /boards/sugar-house-neighbors — a board you belong to');
console.log('  • /mutual     — a completed match with its plan room');
console.log(`\nLive presence expires in ${liveHours}h — re-run this script to refresh it.`);
console.log('On /map, "Show people" defaults to 5 km; widen it to "Around town" to reach Sandy.');
console.log(`\nMock accounts (@${domain}), password: ${password}`);
for (const p of CAST) {
  console.log(`  • @${p.handle} — ${p.name}${p.friend ? ' (friend)' : ' (discoverable)'}${p.live ? ' · sharing live' : ''}`);
}
