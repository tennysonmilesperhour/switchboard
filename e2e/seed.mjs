/**
 * Seed fixture for authenticated e2e tests. Creates two onboarded, connected
 * test users via the service-role admin API so Playwright can log in as them.
 * Idempotent-ish: deletes and recreates the fixture users each run.
 *
 * Requires (point these at a LOCAL/TEST Supabase — never production):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:  node e2e/seed.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const projectRef = (() => {
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
})();
const isLocal = /localhost|127\.0\.0\.1|::1/.test(url);
if (!isLocal && process.env.E2E_ALLOW_NONLOCAL !== '1') {
  console.error(
    `Refusing to seed authenticated E2E fixtures against a non-local Supabase (${url}).`,
  );
  process.exit(1);
}
if (projectRef === 'cuzgighqdzypntmhxrqc') {
  console.error('Refusing to seed authenticated E2E fixtures into production.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'testpassword123';
const USERS = [
  { username: 'e2ehost', name: 'E2E Host' },
  { username: 'e2eguest', name: 'E2E Guest' },
];

// Mirrors usernameToAuthEmail() in src/lib/auth-identity.ts.
const authEmail = (u) => `${u}@users.switchboard.local`;

async function findUserByEmail(email) {
  // Admin listUsers is paginated; the fixture set is tiny so page 1 suffices.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data.users.find((u) => u.email === email) ?? null;
}

async function upsertUser({ username, name }) {
  const email = authEmail(username);
  const existing = await findUserByEmail(email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name, username },
  });
  if (error) throw error;
  const id = data.user.id;

  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id,
      display_name: name,
      handle: username,
      onboarded: true,
      discoverable: true,
    },
    { onConflict: 'id' },
  );
  if (profileError) throw profileError;
  return id;
}

async function main() {
  const ids = {};
  for (const user of USERS) {
    ids[user.username] = await upsertUser(user);
    console.log(`seeded ${user.username} (${ids[user.username]})`);
  }

  // Make the two users accepted friends so invite/mutual flows have an edge.
  await admin
    .from('connections')
    .upsert(
      {
        requester_id: ids.e2ehost,
        addressee_id: ids.e2eguest,
        status: 'accepted',
      },
      { onConflict: 'requester_id,addressee_id' },
    );

  if (!process.env.CI) {
    console.log('\nLogin with these (identifier / password):');
    for (const u of USERS) console.log(`  ${u.username} / ${PASSWORD}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
