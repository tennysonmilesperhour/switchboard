import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_TEST_PASSWORD ?? 'switchboard-test-123';
const domain = 'users.switchboard.local';

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to your environment or .env.local.',
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const people = [
  {
    username: 'mara_host',
    name: 'Mara Host',
    interests: ['dinner', 'live_music', 'board_games'],
    down_to: ['coffee', 'dinner', 'walk'],
  },
  {
    username: 'leo_coffee',
    name: 'Leo Coffee',
    interests: ['coffee', 'books', 'walks'],
    down_to: ['coffee', 'coworking', 'bookstore'],
  },
  {
    username: 'nina_music',
    name: 'Nina Music',
    interests: ['live_music', 'dancing', 'food_trucks'],
    down_to: ['concert', 'late_snack', 'dancing'],
  },
  {
    username: 'omar_games',
    name: 'Omar Games',
    interests: ['board_games', 'trivia', 'pizza'],
    down_to: ['game_night', 'trivia', 'dinner'],
  },
  {
    username: 'ivy_outdoors',
    name: 'Ivy Outdoors',
    interests: ['hiking', 'parks', 'farmers_market'],
    down_to: ['walk', 'hike', 'picnic'],
  },
];

async function upsertUser(person) {
  const email = `${person.username}@${domain}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: person.name, username: person.username },
  });

  if (createError && !/already|registered|exists/i.test(createError.message)) {
    throw createError;
  }

  let user = created.user;
  if (!user) {
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) throw error;
    user = data.users.find((candidate) => candidate.email === email);
  }
  if (!user) throw new Error(`Could not find or create ${email}`);

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      display_name: person.name,
      handle: person.username,
      interests: person.interests,
      down_to: person.down_to,
      timezone: 'America/Denver',
      onboarded: true,
    })
    .eq('id', user.id);
  if (profileError) throw profileError;

  return { ...person, id: user.id, email };
}

async function ensureStarterCircles(userId) {
  const { data: existing, error } = await admin
    .from('circles')
    .select('id')
    .eq('owner_id', userId)
    .limit(1);
  if (error) throw error;
  if (existing?.length) return;

  const { error: insertError } = await admin.from('circles').insert([
    { owner_id: userId, name: 'Close Friends', emoji: 'heart' },
    { owner_id: userId, name: 'Weekend People', emoji: 'sparkles' },
    { owner_id: userId, name: 'Neighbors', emoji: 'pin' },
  ]);
  if (insertError) throw insertError;
}

async function ensureConnection(a, b) {
  const { error } = await admin.from('connections').upsert(
    {
      requester_id: a.id,
      addressee_id: b.id,
      status: 'accepted',
    },
    { onConflict: 'requester_id,addressee_id' },
  );
  if (error) throw error;
}

const seeded = [];
for (const person of people) {
  const user = await upsertUser(person);
  await ensureStarterCircles(user.id);
  seeded.push(user);
}

const [host, ...friends] = seeded;
for (const friend of friends) {
  await ensureConnection(host, friend);
}
await ensureConnection(friends[0], friends[1]);
await ensureConnection(friends[2], friends[3]);

console.log('Seeded Switchboard test profiles:');
for (const person of seeded) {
  console.log(`- @${person.username} / ${password}`);
}
