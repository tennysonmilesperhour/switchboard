// Seed a full "public discovery" demo, geo-tagged around Salt Lake City, wired
// to ONE real viewer account so Row-Level Security actually lets that account
// see it. Running this lights up every discovery / sharing surface of the app:
//
//   • Map (/map)            — Plans, Zones, and Shared-places layers, all pinned
//                             across the Salt Lake valley.
//   • Zones (/zones)        — public "serendipity zones" (visible to everyone).
//   • Moments (/moments)    — your own shared places + anonymized "someone else
//                             is here too" discovery at the same spot.
//   • Discover (/discover)  — open-table plans you can ask to join, plus people
//                             discovery (friends-of-friends with shared interests).
//   • People (/people)      — connections + availability signals.
//   • Boards (/boards/…)    — a neighborhood board you're a member of.
//   • Mutual (/mutual)      — a completed mutual match (with its plan room).
//
// WHY it targets a specific account: the map and most feeds are RLS-scoped.
// Zones are world-readable, but a plan is only visible to its host or a *sent*
// invitee, and a moment is owner-only. So the script finds your real profile by
// email and makes you the host / invitee / owner of the right rows.
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
//
// Idempotent: it owns a fixed set of demo rows (the mock accounts below, the
// listed zone slugs / board slug, and any viewer-owned rows tagged with the
// marker) and clears just those before re-inserting. Re-run it freely.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const viewerEmail = (process.env.SEED_VIEWER_EMAIL ?? 'tennysontaggart@gmail.com').toLowerCase();
const password = process.env.SEED_TEST_PASSWORD ?? 'switchboard-test-123';
const domain = 'discovery.switchboard.local';

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
// populated rather than a single stack of pins.
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
};

// ————————————————————————— mock cast —————————————————————————
// friends: connected to the viewer (power signals, boards, viewer-visible plans)
// strangers: discoverable but NOT connected to the viewer (power People Discovery)
const CAST = [
  { key: 'mara', handle: 'mara_slc', name: 'Mara Fielding', friend: true, area: 'Sugar House, SLC',
    interests: ['dinner', 'live_music', 'board_games'], down_to: ['coffee', 'dinner', 'trivia'] },
  { key: 'leo', handle: 'leo_slc', name: 'Leo Whitfield', friend: true, area: '9th & 9th, SLC',
    interests: ['coffee', 'books', 'cycling'], down_to: ['coffee', 'walk', 'bookstore'] },
  { key: 'nina', handle: 'nina_slc', name: 'Nina Delgado', friend: true, area: 'Downtown, SLC',
    interests: ['live_music', 'dancing', 'food_trucks'], down_to: ['concert', 'dancing', 'drinks'] },
  { key: 'omar', handle: 'omar_slc', name: 'Omar Reyes', friend: true, area: 'The Avenues, SLC',
    interests: ['board_games', 'trivia', 'climbing'], down_to: ['game_night', 'trivia', 'climbing'] },
  { key: 'ivy', handle: 'ivy_slc', name: 'Ivy Sorenson', friend: false, area: 'Millcreek, SLC',
    interests: ['hiking', 'parks', 'farmers_market'], down_to: ['hike', 'picnic', 'walk'] },
  { key: 'sam', handle: 'sam_slc', name: 'Sam Okoye', friend: false, area: 'Liberty Wells, SLC',
    interests: ['coffee', 'photography', 'live_music'], down_to: ['coffee', 'gallery', 'concert'] },
  { key: 'priya', handle: 'priya_slc', name: 'Priya Nair', friend: false, area: 'Marmalade, SLC',
    interests: ['cooking', 'live_music', 'hiking'], down_to: ['coffee', 'dinner', 'concert'] },
];

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

// 1) Mock cast + social graph.
const ids = {};
for (const person of CAST) ids[person.key] = await upsertMock(person);
const mockIds = Object.values(ids);
const friendIds = CAST.filter((p) => p.friend).map((p) => ids[p.key]);

// Viewer <-> friends. Strangers connect only to friends (shared mutuals, but
// not to the viewer — so People Discovery surfaces them).
for (const fId of friendIds) await connect(viewerId, fId);
await connect(ids.mara, ids.leo);
await connect(ids.ivy, ids.leo);
await connect(ids.ivy, ids.mara);
await connect(ids.sam, ids.nina);
await connect(ids.sam, ids.mara);
await connect(ids.priya, ids.omar);
await connect(ids.priya, ids.nina);

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
  const matchRoomIds = (demoMatches ?? [])
    .filter((m) => mockIds.includes(m.user_a) || mockIds.includes(m.user_b))
    .map((m) => m.room_id)
    .filter(Boolean);
  const matchIds = (demoMatches ?? [])
    .filter((m) => mockIds.includes(m.user_a) || mockIds.includes(m.user_b))
    .map((m) => m.id);
  await delIn('matches', 'id', matchIds);
  await delIn('rooms', 'id', matchRoomIds); // room_members cascade
  await delIn('mutual_intents', 'author_id', mockIds);
  await delIn('mutual_intents', 'target_id', mockIds);

  await delIn('availability_signals', 'user_id', mockIds);
  await delIn('live_locations', 'user_id', mockIds);
  await delIn('moments', 'user_id', mockIds);
  await admin.from('moments').delete().eq('user_id', viewerId).in('place_name', [SLC.publik.name, SLC.libertyPark.name]);
  await delIn('events', 'host_id', mockIds); // invites/polls cascade
  await admin.from('events').delete().eq('host_id', viewerId).like('description', `%${MARKER}%`);
  await admin.from('zones').delete().in('slug', [
    'liberty-park-serendipity',
    'downtown-farmers-serendipity',
    'sugar-house-evenings',
    'avenues-morning-walks',
    'red-butte-trailheads',
  ]);
  await admin.from('boards').delete().eq('slug', 'sugar-house-neighbors'); // members/posts cascade
  // Venue perks this script created (scoped to demo owners so real venues stay).
  await admin
    .from('venues')
    .delete()
    .in('claimed_by', mockIds)
    .in('name', ['Publik Coffee Roasters', 'Fisher Brewing Co.', 'The Rose Establishment', 'Pago']);
}

// 3) Zones — public serendipity zones (everyone sees these on the map).
const zones = [
  { slug: 'liberty-park-serendipity', name: 'Liberty Park Serendipity', organizer: ids.mara,
    description: 'Sunny afternoons at the park — picnics, frisbee, and easy hellos.',
    experiences: ['picnic', 'frisbee', 'people_watching'], v: SLC.libertyPark },
  { slug: 'downtown-farmers-serendipity', name: 'Downtown Farmers Serendipity', organizer: ids.leo,
    description: 'Saturday market wanderers — coffee, produce, and live music.',
    experiences: ['coffee', 'market', 'live_music'], v: SLC.pioneerPark },
  { slug: 'sugar-house-evenings', name: 'Sugar House Evenings', organizer: ids.nina,
    description: 'After-work drinks and dinner around Sugar House.',
    experiences: ['dinner', 'drinks', 'dancing'], v: SLC.sugarHousePark },
  { slug: 'avenues-morning-walks', name: 'Avenues Morning Walks', organizer: ids.omar,
    description: 'Early risers walking the Avenues grid with dogs and coffee.',
    experiences: ['walk', 'coffee', 'dogs'], v: SLC.avenues },
  { slug: 'red-butte-trailheads', name: 'Red Butte Trailheads', organizer: ids.ivy,
    description: 'Trail runners and hikers meeting at the foothills.',
    experiences: ['hike', 'trail_run', 'birding'], v: SLC.redButte },
];
await admin.from('zones').insert(
  zones.map((z) => ({
    slug: z.slug, name: z.name, organizer_id: z.organizer, description: z.description,
    experiences: z.experiences, starts_at: at(0, 8), ends_at: at(21, 22),
    latitude: z.v.lat, longitude: z.v.lng,
  })),
);

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
    await admin.from('invites').insert(
      invites.map((inv, i) => ({
        event_id: eventId, invitee_id: inv.id, position: i,
        status: inv.status,
        sent_at: inv.status === 'queued' ? null : new Date(now - HOUR).toISOString(),
        responded_at: inv.status === 'accepted' ? new Date(now - 30 * 60 * 1000).toISOString() : null,
      })),
    );
  }
  return eventId;
}

// 4a) Viewer-hosted plans → show on the viewer's Map (Plans) + plans list.
await makeEvent(
  { host: viewerId, viewerOwned: true, title: 'Sunday Coffee at Publik', description: 'Slow morning, good espresso.',
    v: SLC.publik, starts_at: at(2, 10), ends_at: at(2, 12), status: 'confirmed', capacity: 6 },
  [{ id: ids.leo, status: 'accepted' }, { id: ids.mara, status: 'sent' }],
);
await makeEvent(
  { host: viewerId, viewerOwned: true, title: 'Board Game Night', description: 'BYO snacks, we supply the games.',
    v: SLC.avenues, starts_at: at(5, 19), ends_at: at(5, 22), status: 'inviting', capacity: 8 },
  [{ id: ids.omar, status: 'accepted' }, { id: ids.nina, status: 'sent' }],
);
await makeEvent(
  { host: viewerId, viewerOwned: true, title: 'Trail + Tacos', description: 'Ensign Peak at sunrise, tacos after.',
    v: SLC.ensignPeak, starts_at: at(9, 8), ends_at: at(9, 11), status: 'confirmed', capacity: 5 },
  [{ id: ids.ivy, status: 'accepted' }],
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
  [{ id: viewerId, status: 'sent' }, { id: ids.omar, status: 'accepted' }],
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
  [{ id: ids.mara, status: 'accepted' }],
);

// 5) Moments — viewer-owned "shared places" + friend moments at the SAME place,
//    so find_shared_moments() returns anonymized "someone's here too" candidates.
async function makeMoment(userId, v, experiences, headline, hours) {
  const { error } = await admin.from('moments').insert({
    user_id: userId, place_name: v.name, experiences, headline,
    latitude: v.lat, longitude: v.lng, available_until: inHours(hours), status: 'open',
  });
  if (error) throw error;
}
await makeMoment(viewerId, SLC.publik, ['coffee', 'coworking'], 'Working from Publik till 2', 6);
await makeMoment(viewerId, SLC.libertyPark, ['walk', 'picnic'], 'Lap around Liberty — join?', 4);
await makeMoment(ids.mara, SLC.publik, ['coffee', 'books'], 'Latte + a good book', 5);
await makeMoment(ids.leo, SLC.libertyPark, ['walk', 'frisbee'], 'Frisbee on the grass', 4);

// 6) Availability signals from friends → visible to the viewer on /people.
const signals = [
  { user: ids.mara, emoji: '☕', label: 'Coffee break?', hours: 3 },
  { user: ids.leo, emoji: '🚶', label: 'Free for a walk', hours: 2 },
  { user: ids.nina, emoji: '🍸', label: 'Drinks later?', hours: 6 },
  { user: ids.omar, emoji: '🎲', label: 'Game night tonight', hours: 8 },
];
await admin.from('availability_signals').insert(
  signals.map((s) => ({ user_id: s.user, emoji: s.emoji, label: s.label, expires_at: inHours(s.hours) })),
);

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
//     the cast is clustered within ~5 km of it. All time-boxed (expire in 2h).
const share = (userId, lat, lng, headline, emoji, visibility = 'sharers') =>
  admin.from('live_locations').upsert(
    {
      user_id: userId, latitude: lat, longitude: lng, accuracy_m: 30,
      headline, emoji, visibility, updated_at: new Date().toISOString(), expires_at: inHours(2),
    },
    { onConflict: 'user_id' },
  );
// The viewer shares too, so "see and be seen" is satisfied and the map lights up
// immediately. (It's their own ephemeral row — turn it off from the map anytime.)
await share(viewerId, 40.766, -111.891, 'Downtown for the afternoon', '📍');
await share(ids.nina, 40.7663, -111.8887, 'Coffee downtown', '☕');
await share(ids.leo, 40.7642, -111.9012, 'At the farmers market', '🧺');
await share(ids.mara, 40.7527, -111.862, 'Working from 9th & 9th', '💻', 'connections');
await share(ids.omar, 40.755, -111.866, 'Bouldering later, say hi', '🧗', 'connections');
await share(ids.ivy, 40.7466, -111.8747, 'Walking the Liberty Park loop', '🚶');
await share(ids.sam, 40.736, -111.876, 'Shooting film around the block', '📷');
await share(ids.priya, 40.779, -111.902, 'Trying the new coffee spot', '☕');

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
    { board_id: board.id, member_id: ids.leo, role: 'member' },
    { board_id: board.id, member_id: ids.nina, role: 'member' },
    { board_id: board.id, member_id: ids.omar, role: 'member' },
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

console.log('\nDiscovery demo seeded. Sign in as', viewerEmail, 'and explore:');
console.log('  • /map        — Plans / Zones / Shared places layers + live people sharing nearby (SLC)');
console.log('  • /zones      — 5 public serendipity zones');
console.log('  • /moments    — your places + "someone else is here too"');
console.log('  • /discover   — 2 open tables to join + people to meet');
console.log('  • /people     — friends + live availability signals');
console.log('  • /boards/sugar-house-neighbors — a board you belong to');
console.log('  • /mutual     — a completed match with its plan room');
console.log(`\nMock accounts (@${domain}), password: ${password}`);
for (const p of CAST) console.log(`  • @${p.handle} — ${p.name}${p.friend ? ' (friend)' : ' (discoverable)'}`);
