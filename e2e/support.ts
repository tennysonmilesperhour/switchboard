import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { LEGAL_VERSION } from '../src/lib/legal';

/**
 * Shared plumbing for the authenticated journeys that need more than a
 * browser: the service-role client (to move a deadline into the past, or to
 * make a throwaway account), the local Mailpit (to open a link the app sent),
 * and the cron routes (to run a sweep on demand).
 *
 * Everything here drives the real app. The service role only ever arranges the
 * world — creates an account, backdates a window — and never stands in for the
 * step under test: that is always a click, a link or a cron request.
 */

export const DB = !!process.env.E2E_DB;
export const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'testpassword123';
const MAILPIT = (process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324').replace(/\/$/, '');

/** A token no other run has used, for names a person would type. */
export function unique(prefix: string): string {
  const stamp = Date.now().toString(36).slice(-6);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}${stamp}${random}`;
}

/** The terms version the proxy requires, straight from the app's own constant. */
export { LEGAL_VERSION };

let admin: SupabaseClient | null = null;

/** The service-role client. Local stack only — seed.mjs refuses anything else. */
export function adminClient(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for these journeys (see e2e/README.md).',
    );
  }
  if (!/localhost|127\.0\.0\.1|::1/.test(url) && process.env.E2E_ALLOW_NONLOCAL !== '1') {
    throw new Error(`Refusing to arrange e2e state against a non-local Supabase (${url}).`);
  }
  admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin;
}

// ——— Sessions ———

type Cookies = Awaited<ReturnType<BrowserContext['cookies']>>;
const sessionCookies = new Map<string, Cookies>();

/**
 * Where a session is shared between this run's workers. Playwright empties
 * the output directory at the start of every run, so nothing outlives it, and
 * the directory is hidden so CI's failure-evidence upload (which skips hidden
 * files) never carries session cookies off the runner.
 */
function sessionFile(identifier: string): string {
  return join(test.info().project.outputDir, '.e2e-sessions', `${identifier}.json`);
}

async function cachedSession(identifier: string): Promise<Cookies | null> {
  const inMemory = sessionCookies.get(identifier);
  if (inMemory) return inMemory;
  try {
    return JSON.parse(await readFile(sessionFile(identifier), 'utf8')) as Cookies;
  } catch {
    return null;
  }
}

async function keepSession(identifier: string, cookies: Cookies): Promise<void> {
  sessionCookies.set(identifier, cookies);
  const file = sessionFile(identifier);
  await mkdir(dirname(file), { recursive: true });
  // Written aside and renamed into place, so another worker reading at the
  // same moment sees the old session or the new one, never half of either.
  const partial = `${file}.${process.pid}.tmp`;
  await writeFile(partial, JSON.stringify(cookies));
  await rename(partial, file);
}

/**
 * Sign in as a seeded or throwaway user without spending the sign-in form.
 *
 * The form allows 30 attempts per connection per ten minutes, and every
 * journey here comes from one address. Once the suites grew past that, the
 * thirty-first sign-in failed with SB-RATE-LIMIT and took a dozen unrelated
 * journeys down with it. So this asks the auth server for a session with the
 * account's real password, through the same `@supabase/ssr` cookie format the
 * app writes, and hands the browser those cookies. The form itself is still
 * walked where signing in is the step under test (accounts.spec.ts, the
 * seeded sign-in journey, a suspended sign-in).
 *
 * Sessions are shared across this run's workers; a reused one is checked
 * against the app before it is trusted.
 */
export async function login(page: Page, identifier: string, password = PASSWORD): Promise<void> {
  const cached = await cachedSession(identifier);
  if (cached) {
    await page.context().addCookies(cached);
    if (await signedInAs(page, identifier)) {
      await keepSession(identifier, await page.context().cookies());
      return;
    }
    console.log(`[e2e] reused session for ${identifier} did not hold; signing in again`);
    sessionCookies.delete(identifier);
    await page.context().clearCookies();
  }

  await page.context().addCookies(await sessionCookiesFor(identifier, password));
  expect(
    await signedInAs(page, identifier),
    `signed in as "${identifier}" but the app does not show that account`,
  ).toBe(true);
  await keepSession(identifier, await page.context().cookies());
}

/** The cookies the app would set after a successful sign-in as @handle. */
export async function sessionCookiesFor(handle: string, password = PASSWORD): Promise<Cookies> {
  const admin = adminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();
  if (profileError || !profile) {
    throw new Error(`No profile with handle "${handle}" (${profileError?.message ?? 'not found'})`);
  }
  const { data: found, error: userError } = await admin.auth.admin.getUserById(profile.id);
  const email = found?.user?.email;
  if (userError || !email) throw new Error(`No sign-in email for "${handle}"`);

  const jar = new Map<string, string>();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => {
          for (const { name, value } of cookies) jar.set(name, value);
        },
      },
    },
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`The auth server refused "${handle}": ${error.message}`);
  await expect.poll(() => jar.size, { message: 'the auth library never wrote a session cookie' }).toBeGreaterThan(0);
  const host = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000').hostname;
  return [...jar]
    .filter(([, value]) => value)
    .map(([name, value]) => ({
      name,
      value,
      domain: host,
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    }));
}

/** Does the app itself agree this browser is @identifier? */
export async function signedInAs(page: Page, identifier: string): Promise<boolean> {
  await page.goto('/profile');
  try {
    await expect(page.getByText(`@${identifier}`, { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Drive the sign-in form and wait to leave /login, quoting the page if it refuses. */
export async function signIn(page: Page, identifier: string, password = PASSWORD): Promise<void> {
  await submitSignIn(page, identifier, password);
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  } catch {
    throw new Error(
      `Sign-in as "${identifier}" never left /login. The page said: ${
        (await pageComplaints(page)) || 'nothing — no error was shown'
      }`,
    );
  }
}

/** Fill and submit the sign-in form without assuming it succeeds. */
export async function submitSignIn(page: Page, identifier: string, password: string): Promise<void> {
  if (!new URL(page.url()).pathname.startsWith('/login')) await page.goto('/login');
  await page.getByPlaceholder('email or username').fill(identifier);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  // "Sign in" is also the mode tab's name; the submit is the one in the form.
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
}

/** Visible alert text, normalised — what the app is objecting to right now. */
export async function pageComplaints(page: Page): Promise<string> {
  const alerts = (await page.getByRole('alert').allInnerTexts())
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return alerts.join(' | ');
}

/**
 * Wait for a toast saying `expected`. Toasts stack and auto-dismiss, so this
 * waits for the words rather than for "any toast" (which may still be the
 * previous action's), and on failure quotes what the app did say.
 */
export async function expectToast(page: Page, expected: string): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' });
  try {
    await expect(toasts).toContainText(expected, { timeout: 15_000 });
  } catch {
    const said = (await toasts.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const complaints = await pageComplaints(page);
    throw new Error(
      `Expected a toast saying "${expected}". The toasts said: ${said || 'nothing'}${
        complaints ? `. On screen: ${complaints}` : ''
      }`,
    );
  }
}

// ——— Throwaway accounts ———

export interface Account {
  id: string;
  handle: string;
  name: string;
  email: string;
  password: string;
}

/**
 * Make an account the way the app's own sign-up leaves one: confirmed, with a
 * profile. `legalVersion` defaults to the current terms; pass an old one to
 * meet the legal-update funnel. The sign-in rate limit is per connection, so
 * journeys about one account's life make a fresh one rather than reuse the
 * seeded users (whose sessions the other journeys rely on).
 */
export async function createAccount(options: {
  handle: string;
  name: string;
  email?: string;
  legalVersion?: string;
}): Promise<Account> {
  const email = options.email ?? `${options.handle}@users.switchboard.local`;
  const client = adminClient();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: options.name, username: options.handle },
  });
  if (error) throw error;
  const id = data.user.id;
  const now = new Date().toISOString();
  const { error: profileError } = await client.from('profiles').upsert(
    {
      id,
      display_name: options.name,
      handle: options.handle,
      onboarded: true,
      legal_terms_version: options.legalVersion ?? LEGAL_VERSION,
      legal_terms_accepted_at: now,
      community_covenant_accepted_at: now,
    },
    { onConflict: 'id' },
  );
  if (profileError) throw profileError;
  return { id, handle: options.handle, name: options.name, email, password: PASSWORD };
}

// ——— Mail ———

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

/**
 * The app must be delivering into Mailpit for a journey that starts with "open
 * the link we sent you". Say so up front rather than as a 30-second wait.
 */
export function requireMailRelay(): void {
  expect(
    process.env.RESEND_API_URL,
    'Mail journeys need the app started with RESEND_API_KEY, EMAIL_FROM and a loopback RESEND_API_URL, and the same RESEND_API_URL in the test environment (see e2e/README.md)',
  ).toBeTruthy();
}

/** Wait for the app's email to `to` whose subject contains `subject`; return its text. */
export async function waitForMail(
  to: string,
  subject: string,
  timeout = 30_000,
): Promise<string> {
  const deadline = Date.now() + timeout;
  const query = encodeURIComponent(`to:${to}`);
  let seen: string[] = [];
  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${query}&limit=50`);
    if (response.ok) {
      const { messages = [] } = (await response.json()) as { messages?: MailpitSummary[] };
      const mine = messages.filter((message) =>
        message.To.some((recipient) => recipient.Address.toLowerCase() === to.toLowerCase()),
      );
      seen = mine.map((message) => message.Subject);
      const hit = mine.find((message) => message.Subject.includes(subject));
      if (hit) {
        const detail = await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`);
        const { Text } = (await detail.json()) as { Text?: string };
        return Text ?? '';
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `No email to ${to} with a subject containing "${subject}" reached Mailpit within ${
      timeout / 1000
    }s. Subjects that did arrive for that address: ${seen.length ? seen.join(' | ') : 'none'}.`,
  );
}

/** The first link in an email body whose path starts with `path`. */
export function linkIn(text: string, path: string): string {
  const link = text
    .match(/https?:\/\/[^\s<>"]+/g)
    ?.find((candidate) => new URL(candidate).pathname.startsWith(path));
  if (!link) throw new Error(`The email carries no ${path} link. It said:\n${text}`);
  return link;
}

// ——— Cron ———

/**
 * Run the minute sweep (`/api/cron/cascade`) now, with the secret the app was
 * started with, and return its summary.
 *
 * A sweep another journey started at the same moment answers `skipped:
 * overlap`, and the route allows five calls a minute; both are retried, since
 * neither means this sweep ran. Only a completed sweep is returned.
 */
export async function runCascadeSweep(request: APIRequestContext): Promise<Record<string, unknown>> {
  const secret = process.env.CRON_SECRET;
  expect(
    secret,
    'CRON_SECRET must be set in the test environment to the value the app was started with (see e2e/README.md)',
  ).toBeTruthy();
  let last = 'no response';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get('/api/cron/cascade', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok() && !body.skipped) return body;
    last = `HTTP ${response.status()} ${JSON.stringify(body)}`;
    if (response.status() === 401 || response.status() === 500) {
      throw new Error(
        `The cascade sweep refused to run (${last}). Is the app running with the same CRON_SECRET as the tests?`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`The cascade sweep never completed a run: ${last}`);
}
