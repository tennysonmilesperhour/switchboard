import { createHash } from 'node:crypto';
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import {
  adminClient,
  createAccount,
  DB,
  expectToast,
  linkIn,
  requireMailRelay,
  login,
  unique,
  waitForMail,
  type Account,
} from './support';

/**
 * You, your settings and the app shell: what reaches you and when, getting back
 * into an account, and the screens that must say "this failed" rather than
 * "there is nothing here" (docs/archive/COMPLETION-PLAN-2026-09.md, G4 to G49,
 * decisions D15, D16 and D27).
 *
 * Every journey makes its own account, so none of them changes the seeded
 * users. The service role only arranges the world (a verified phone, a STOP
 * from the carrier, a backlog of notifications, a mail quota already spent);
 * the step under test is always a click, a link from an email, or the real
 * hourly digest sweep called with the app's CRON_SECRET.
 */

const MAILPIT = (process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:54324').replace(/\/$/, '');

/** A fresh browser, signed in as `account`, for the length of `fn`. */
async function asAccount<T>(
  browser: Browser,
  account: Account,
  fn: (page: Page) => Promise<T>,
  options: BrowserContextOptions = {},
): Promise<T> {
  const context = await browser.newContext(options);
  try {
    const page = await context.newPage();
    await login(page, account.handle, account.password);
    return await fn(page);
  } finally {
    await context.close();
  }
}

/** A device that has never been signed in. */
async function freshDevice<T>(browser: Browser, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

/** The floating Save / Cancel bar that holds every Settings edit. */
function saveBar(page: Page) {
  return page.getByRole('region', { name: 'Unsaved settings changes' });
}

async function saveSettings(page: Page) {
  await saveBar(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Changes saved.' })).toBeVisible();
  await expect(saveBar(page)).toBeHidden();
}

/** Give an account a contact detail it has already proven, as verification would. */
async function arrangeVerifiedContact(
  account: Account,
  kind: 'email' | 'phone',
  value: string,
): Promise<void> {
  const admin = adminClient();
  const column = kind === 'email' ? 'contact_email' : 'contact_phone';
  const { error } = await admin.from('profiles').update({ [column]: value }).eq('id', account.id);
  expect(error, error?.message).toBeNull();
  const { data, error: verifyError } = await admin
    .from('profile_contacts')
    .update({ verified_at: new Date().toISOString() })
    .eq('user_id', account.id)
    .eq('kind', kind)
    .select('kind');
  expect(verifyError, verifyError?.message).toBeNull();
  expect(data, `no ${kind} contact row was synced for ${account.handle}`).toHaveLength(1);
}

/** How many emails to `to` with `subject` in their subject Mailpit holds. */
async function mailCount(to: string, subject: string): Promise<number> {
  const response = await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=50`,
  );
  if (!response.ok) return 0;
  const { messages = [] } = (await response.json()) as {
    messages?: Array<{ Subject: string; To: Array<{ Address: string }> }>;
  };
  return messages.filter(
    (message) =>
      message.Subject.includes(subject) &&
      message.To.some((recipient) => recipient.Address.toLowerCase() === to.toLowerCase()),
  ).length;
}

/**
 * Run the hourly digest sweep now, as Vercel's cron would, and return its
 * summary. An overlapping sweep or the route's five-a-minute limit is retried,
 * since neither means this sweep ran.
 */
async function runDigestSweep(
  request: import('@playwright/test').APIRequestContext,
): Promise<Record<string, unknown>> {
  const secret = process.env.CRON_SECRET;
  expect(secret, 'CRON_SECRET must match the running app (see e2e/README.md)').toBeTruthy();
  let last = 'no response';
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get('/api/cron/digest', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok() && !body.skipped) return body;
    last = `HTTP ${response.status()} ${JSON.stringify(body)}`;
    if (response.status() === 401 || response.status() === 500) {
      throw new Error(`The digest sweep refused to run (${last}).`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`The digest sweep never completed a run: ${last}`);
}

/** The digest hours Settings offers, as it labels them. */
const DIGEST_HOURS: Array<[number, string]> = [
  [6, '6am'],
  [7, '7am'],
  [8, '8am'],
  [9, '9am'],
  [10, '10am'],
  [12, 'midday'],
  [17, '5pm'],
  [20, '8pm'],
];

/**
 * A time zone where it is one of the offered digest hours right now, so the
 * sweep finds this person inside their window (the hour plus two retries)
 * without waiting for a real morning.
 */
function zoneAtADigestHour(): { zone: string; label: string } {
  const now = new Date();
  for (const zone of Intl.supportedValuesOf('timeZone')) {
    if (zone === 'UTC' || !zone.includes('/')) continue;
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: zone }).format(
        now,
      ),
    );
    const match = DIGEST_HOURS.find(([offered]) => offered === hour);
    if (match) return { zone, label: match[1] };
  }
  throw new Error('No time zone is at an offered digest hour right now');
}

/** The live card's "N people are sharing near you." line. */
function nearbyCount(page: Page) {
  return page.getByText(/(No one else is|\d+ (person is|people are)) sharing near you( yet)?\./);
}

/** Make the server fail every "who's nearby" check (the action posts just a radius). */
async function failNearbyChecks(page: Page) {
  await page.route('**/map', (route) =>
    route.request().method() === 'POST' && /^\[\d+\]$/.test(route.request().postData() ?? '')
      ? route.fulfill({ status: 500, body: 'unavailable' })
      : route.continue(),
  );
}

/** Somewhere the other journeys don't share their location from. */
const SHARING_FROM = {
  geolocation: { latitude: -41.2865, longitude: 174.7762 },
  permissions: ['geolocation'],
};

test.describe('settings, notifications and account', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'authenticated journeys run against the desktop app shell');

  test('every notification choice waits for one Save, is guarded on leaving, and the time zone sticks', async ({
    browser,
  }) => {
    const account = await createAccount({ handle: unique('e2est'), name: 'Tess Settings' });

    // A device in New York, on an account that has never said where it is.
    await asAccount(
      browser,
      account,
      async (page) => {
        await page.goto('/settings');
        const reminders = page.getByRole('combobox', { name: 'Event reminders' });
        const timeZone = page.getByRole('combobox', { name: 'Your time zone' });
        await expect(timeZone).toHaveValue('UTC');

        // A channel choice is held by the bar, not saved on change (G49)…
        await reminders.selectOption('in_app');
        await expect(saveBar(page)).toBeVisible();
        await expect(saveBar(page)).toContainText('You have unsaved changes');

        // …and an in-app link asks first, rather than dropping it.
        await page.getByRole('link', { name: 'Edit contact details' }).click();
        const leave = page.getByRole('dialog', { name: 'Leave without saving?' });
        await expect(leave).toBeVisible();
        await leave.getByRole('button', { name: 'Cancel' }).click();
        await expect(page).toHaveURL(/\/settings$/);

        // Cancel puts it back.
        await saveBar(page).getByRole('button', { name: 'Cancel' }).click();
        await expect(reminders).toHaveValue('existing');
        await expect(saveBar(page)).toBeHidden();

        // Text-message categories can't be ticked before there is a verified
        // phone and consent to text it: a tick there would save and do nothing.
        await expect(page.getByRole('checkbox', { name: 'Event reminders' })).toBeDisabled();

        // The time zone quiet hours follow is visible and editable (G13), and
        // the device's own zone is one tap away.
        await expect(page.getByText('This device is set to America/New York.')).toBeVisible();
        await page.getByRole('button', { name: 'Use it' }).click();
        await expect(timeZone).toHaveValue('America/New_York');
        await page.getByRole('combobox', { name: 'From' }).selectOption('22');
        await page.getByRole('combobox', { name: 'Until' }).selectOption('7');
        await reminders.selectOption('in_app');
        await saveSettings(page);

        await page.reload();
        await expect(timeZone).toHaveValue('America/New_York');
        await expect(page.getByRole('combobox', { name: 'From' })).toHaveValue('22');
        await expect(page.getByRole('combobox', { name: 'Until' })).toHaveValue('7');
        await expect(reminders).toHaveValue('in_app');
        await expect(page.getByText('This device is set to')).toBeHidden();
      },
      { timezoneId: 'America/New_York' },
    );

    const { data: profile } = await adminClient()
      .from('profiles')
      .select('timezone, quiet_hours_start, quiet_hours_end')
      .eq('id', account.id)
      .single();
    expect(profile).toEqual({ timezone: 'America/New_York', quiet_hours_start: 22, quiet_hours_end: 7 });
  });

  test('an "SMS only" route falls back to existing settings when texts stop, and Settings says why', async ({
    browser,
  }) => {
    const account = await createAccount({ handle: unique('e2esm'), name: 'Sid Sms' });
    const phone = `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    await arrangeVerifiedContact(account, 'phone', phone);

    try {
      await asAccount(browser, account, async (page) => {
        await page.goto('/settings');
        const plans = page.getByRole('combobox', { name: 'Invitations and plan updates' });

        // Subscribe and choose texts as the only channel for plan alerts.
        await page.getByRole('checkbox', { name: 'I agree to receive these text messages.' }).check();
        await plans.selectOption('sms');
        await saveSettings(page);

        // Turning texts off while they are the only channel moves that choice
        // back to existing settings in the draft, and says so before saving.
        await page
          .getByRole('checkbox', { name: 'I agree to receive these text messages.' })
          .uncheck();
        await expect(plans).toHaveValue('existing');
        await expect(
          page.getByText('SMS can’t carry plan alerts any more, so that will use existing settings instead.'),
        ).toBeVisible();
        await saveBar(page).getByRole('button', { name: 'Cancel' }).click();
        await expect(plans).toHaveValue('sms');

        // The carrier reports that the number texted STOP (D15).
        const { error } = await adminClient()
          .from('sms_opt_outs')
          .insert({ normalized_number: phone });
        expect(error, error?.message).toBeNull();

        await page.reload();
        const note = page.getByRole('status').filter({ hasText: 'switched back to Existing settings' });
        await expect(note).toContainText('because your number texted STOP');
        await expect(note).toContainText('Text START to the Switchboard number');
        await expect(plans).toHaveValue('existing');
        await expect(plans.locator('option[value="sms"]')).toHaveText(
          'SMS only — your number texted STOP',
        );
        await expect(plans.locator('option[value="sms"]')).toHaveJSProperty('disabled', true);

        // "Got it" is remembered.
        await note.getByRole('button', { name: 'Got it' }).click();
        await expect(note).toBeHidden();
        await page.reload();
        await expect(page.getByRole('combobox', { name: 'Invitations and plan updates' })).toBeVisible();
        await expect(note).toHaveCount(0);
      });

      const { data: routes } = await adminClient()
        .from('notification_routes')
        .select('plans, sms_fallback_reason')
        .eq('user_id', account.id)
        .single();
      expect(routes).toEqual({ plans: 'existing', sms_fallback_reason: null });
    } finally {
      // The STOP list is keyed by number, not account; don't leave this one behind.
      await adminClient().from('sms_opt_outs').delete().eq('normalized_number', phone);
    }
  });

  test('the daily digest gathers the day into one email, and an undelivered one is retried', async ({
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    requireMailRelay();
    const handle = unique('e2edg');
    const account = await createAccount({
      handle,
      name: 'Dana Digest',
      email: `${handle}@example.com`,
    });
    await arrangeVerifiedContact(account, 'email', account.email);
    const { zone, label } = zoneAtADigestHour();

    // Turn the digest on from Settings, at the hour it is now where they live.
    await asAccount(
      browser,
      account,
      async (page) => {
        await page.goto('/settings');
        await page.getByRole('button', { name: 'Use it' }).click();
        await expect(page.getByRole('combobox', { name: 'Your time zone' })).toHaveValue(zone);
        await page.getByRole('checkbox', { name: /A daily summary instead/ }).check();
        // No push on this server, but a verified email: nothing to warn about.
        await expect(page.getByText('There’s nowhere to send it yet')).toBeHidden();
        await page.getByRole('combobox', { name: /Send it around/ }).selectOption({ label });
        await saveSettings(page);
      },
      { timezoneId: zone },
    );

    // A day of things that wait for the summary.
    const now = Date.now();
    const { error: seedError } = await adminClient()
      .from('notifications')
      .insert([
        { user_id: account.id, kind: 'room_message', title: 'Ana: see you there', created_at: new Date(now - 60_000).toISOString() },
        { user_id: account.id, kind: 'room_message', title: 'Ben: running late', created_at: new Date(now - 30_000).toISOString() },
        { user_id: account.id, kind: 'connection_request', title: 'Cal wants to connect', created_at: new Date(now - 10_000).toISOString() },
      ]);
    expect(seedError, seedError?.message).toBeNull();

    // This person's notification-email allowance for the day is already spent,
    // so the email fallback cannot go out at the digest hour.
    const quotaKey = createHash('sha256').update(`notification-email:${account.id}`).digest('hex');
    const { error: quotaError } = await adminClient()
      .from('rate_limits')
      .upsert({ key_hash: quotaKey, attempts: 12, window_started_at: new Date().toISOString() });
    expect(quotaError, quotaError?.message).toBeNull();

    const sentAt = async () =>
      (
        await adminClient().from('profiles').select('digest_sent_at').eq('id', account.id).single()
      ).data?.digest_sent_at ?? null;

    const failedRun = await runDigestSweep(request);
    expect(Number(failedRun.retrying), JSON.stringify(failedRun)).toBeGreaterThanOrEqual(1);
    // Not marked sent, so the next sweep in the window tries again (D16).
    expect(await sentAt()).toBeNull();
    expect(await mailCount(account.email, 'Your day on Switchboard')).toBe(0);

    // The allowance comes back; the next hourly sweep delivers it.
    await adminClient().from('rate_limits').delete().eq('key_hash', quotaKey);
    // The next hourly sweep delivers it. Another sweep is allowed if that one
    // meets a passing outage too (the shared relay, say): that is the retry
    // under test, not a way round it.
    let retried: Record<string, unknown> = {};
    for (let sweep = 0; sweep < 3 && !(await sentAt()); sweep += 1) {
      retried = await runDigestSweep(request);
    }
    expect(await sentAt(), `the digest was never delivered: ${JSON.stringify(retried)}`).not.toBeNull();

    const mail = await waitForMail(account.email, 'Your day on Switchboard');
    expect(mail).toContain('2 new messages and 1 connection request');
    expect(linkIn(mail, '/notifications')).toMatch(/\/notifications$/);

    // Once a day: another sweep inside the window sends nothing more.
    await runDigestSweep(request);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(await mailCount(account.email, 'Your day on Switchboard')).toBe(1);
  });

  test('older notifications load a page at a time, and a failed load says so with a code', async ({
    browser,
  }) => {
    const account = await createAccount({ handle: unique('e2ent'), name: 'Nell Notify' });
    const start = Date.now() - 2 * 3_600_000;
    const { error } = await adminClient()
      .from('notifications')
      .insert(
        Array.from({ length: 45 }, (_, index) => ({
          user_id: account.id,
          kind: 'room_message',
          title: `Backlog note ${String(index + 1).padStart(2, '0')}`,
          created_at: new Date(start + index * 60_000).toISOString(),
        })),
      );
    expect(error, error?.message).toBeNull();

    await asAccount(browser, account, async (page) => {
      await page.goto('/notifications');
      const notes = page.getByText(/^Backlog note \d\d$/);
      await expect(notes).toHaveCount(20);
      await expect(notes.first()).toHaveText('Backlog note 45');
      await expect(page.getByText('45 unread — tap one to mark it read')).toBeVisible();

      const older = page.getByRole('button', { name: 'Show older' });

      // A load that fails is a coded failure, and leaves the button to retry (G16).
      await page.route('**/notifications', (route) =>
        route.request().method() === 'POST' && route.request().headers()['next-action']
          ? route.fulfill({ status: 500, body: 'unavailable' })
          : route.continue(),
      );
      await older.click();
      await expectToast(page, 'Could not load older notifications. Try again.');
      await expectToast(page, 'SB-NOTIFY-LOAD');
      await expect(notes).toHaveCount(20);
      await page.unroute('**/notifications');

      await older.click();
      await expect(notes).toHaveCount(40);
      await older.click();
      await expect(notes).toHaveCount(45);
      await expect(notes.last()).toHaveText('Backlog note 01');
      await expect(older).toBeHidden();
      // Every note once, in order.
      const titles = await notes.allInnerTexts();
      expect(new Set(titles).size).toBe(45);
      expect(titles).toEqual([...titles].sort().reverse());
    });
  });

  test('a username account adds a recovery email from Settings, and can then reset its password', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    requireMailRelay();
    const account = await createAccount({ handle: unique('e2erc'), name: 'Remy Recover' });
    const recovery = `${account.handle}@example.com`;

    await asAccount(browser, account, async (page) => {
      // D27: a username-only account is told it cannot recover a password yet.
      await page.goto('/settings');
      const banner = page.getByRole('status').filter({ hasText: 'Add a way back into your account' });
      await expect(banner).toContainText('there is no way to reset it until your account has a verified email');
      await banner.getByRole('link', { name: 'Add a recovery email' }).click();

      await page.waitForURL(/\/profile\/edit/);
      await page.getByLabel('Email', { exact: true }).fill(recovery);
      await page.getByRole('button', { name: 'Save profile' }).click();
      await page.waitForURL(/\/profile$/);

      // Back in Settings the banner names the address and the step left.
      await page.goto('/settings');
      await expect(banner).toContainText(`Verify ${recovery} below`);
      await page.getByRole('button', { name: 'Send link' }).click();

      const mail = await waitForMail(recovery, 'Verify your Switchboard email');
      await page.goto(linkIn(mail, '/verify-contact'));
      await page.getByRole('button', { name: 'Verify email' }).click();
      await page.waitForURL(/\/settings\?contact=verified/);
      await expect(page.getByText('Email verified.')).toBeVisible();
      await expect(banner).toHaveCount(0);
    });

    // Forgotten password, asked for by username: the reset goes to the
    // address just verified.
    await freshDevice(browser, async (page) => {
      await page.goto('/forgot-password');
      await page.getByPlaceholder('Email or username').fill(account.handle);
      await page.getByRole('button', { name: 'Send recovery instructions' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'we’ll send instructions' })).toBeVisible();
      const reset = await waitForMail(recovery, 'Reset your Switchboard password');
      await page.goto(linkIn(reset, '/auth/confirm'));
      await page.waitForURL(/\/reset-password/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    });
  });

  test('a failed email link keeps where it was going, and every Google failure carries a code', async ({
    browser,
  }) => {
    const account = await createAccount({ handle: unique('e2elk'), name: 'Lin Link' });

    await freshDevice(browser, async (page) => {
      // An expired confirmation link to the plan wizard (D27 / G45)…
      await page.goto('/auth/confirm?token_hash=expired-or-used&type=signup&next=%2Fevents%2Fnew');
      await expect(page).toHaveURL(/\/login\?.*next=%2Fevents%2Fnew/);
      const alert = page.getByRole('alert').filter({ hasText: 'SB-AUTH-LINK' });
      await expect(alert).toContainText('That emailed link has expired or was already used.');

      // …and signing in from there lands where the link was going.
      await page.getByPlaceholder('email or username').fill(account.handle);
      await page.getByPlaceholder('Password', { exact: true }).fill(account.password);
      await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL(/\/events\/new/, { timeout: 30_000 });
    });

    await freshDevice(browser, async (page) => {
      // A dead reset link offers a fresh one, not "sign in".
      await page.goto('/auth/confirm?token_hash=expired-or-used&type=recovery');
      const alert = page.getByRole('alert').filter({ hasText: 'SB-AUTH-LINK' });
      await expect(alert).toContainText('That password-reset link has expired or was already used.');
      await expect(alert.getByRole('link', { name: 'Request a fresh one' })).toHaveAttribute(
        'href',
        '/forgot-password',
      );

      // An off-site destination is dropped, not followed.
      await page.goto('/auth/confirm?token_hash=x&type=magiclink&next=https%3A%2F%2Fevil.example');
      await expect(page).toHaveURL((url) => url.pathname === '/login' && !url.search.includes('evil'));

      // Each way Google's round trip can end short has its own code (G47),
      // and the callback keeps the destination.
      const cases: Array<[string, string, string]> = [
        ['/auth/callback?error=access_denied&next=%2Fplans', 'SB-OAUTH-DENIED', 'Google didn’t complete the sign-in.'],
        ['/auth/callback?next=%2Fplans', 'SB-OAUTH-MISSING', 'Google sent you back without a sign-in code.'],
        ['/auth/callback?code=not-a-real-code&next=%2Fplans', 'SB-OAUTH-EXCHANGE', 'Google approved the sign-in, but Switchboard couldn’t finish it.'],
      ];
      for (const [path, code, sentence] of cases) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\?.*next=%2Fplans/);
        const shown = page.getByRole('alert').filter({ hasText: code });
        await expect(shown, `${path} should show ${code}`).toContainText(sentence);
      }
    });
  });

  test('live location: the radius changes while sharing, is remembered, and a failed check is shown', async ({
    browser,
  }) => {
    const account = await createAccount({ handle: unique('e2elv'), name: 'Liv Live' });

    await asAccount(
      browser,
      account,
      async (page) => {
        await page.goto('/map');
        const radius = page.getByRole('combobox', { name: 'Show people' });
        await expect(radius).toHaveValue('5000');
        await page.getByRole('button', { name: /Share my location/ }).click();
        const live = page.getByText('You’re live on the map');
        await expect(live).toBeVisible({ timeout: 20_000 });

        try {
          // Widened while sharing (G42), and still widened after a reload.
          await page.getByRole('combobox', { name: 'Show people' }).selectOption('25000');
          await expect(nearbyCount(page)).toBeVisible();
          await page.reload();
          await expect(live).toBeVisible();
          await expect(page.getByRole('combobox', { name: 'Show people' })).toHaveValue('25000');

          // A "who's nearby" check the server fails is said, with its code,
          // instead of the last count standing as if it were current.
          await failNearbyChecks(page);
          await page.getByRole('combobox', { name: 'Show people' }).selectOption('1000');
          await expect(
            page.getByRole('status').filter({ hasText: 'Couldn’t check who’s nearby just now.' }),
          ).toContainText('SB-LOCATION-LOAD');
          await expect(nearbyCount(page)).toBeHidden();
          await page.unroute('**/map');

          await page.getByRole('combobox', { name: 'Show people' }).selectOption('5000');
          await expect(nearbyCount(page)).toBeVisible();
          await expect(page.getByText('Couldn’t check who’s nearby just now.')).toBeHidden();
        } finally {
          await page.unroute('**/map');
          await page.getByRole('button', { name: 'Stop' }).click();
          await expect(page.getByRole('button', { name: /Share my location/ })).toBeVisible();
        }
      },
      SHARING_FROM,
    );
  });

  // A failed check clears the live markers; the directory under the map must
  // not read that as an empty neighbourhood while the card says it failed.
  test('while the nearby check is failing, the map does not claim nobody is around', async ({
    browser,
  }) => {
    const account = await createAccount({ handle: unique('e2elf'), name: 'Lou Lost' });

    await asAccount(
      browser,
      account,
      async (page) => {
        await page.goto('/map');
        await page.getByRole('button', { name: /Share my location/ }).click();
        await expect(page.getByText('You’re live on the map')).toBeVisible({ timeout: 20_000 });
        try {
          await failNearbyChecks(page);
          await page.getByRole('combobox', { name: 'Show people' }).selectOption('1000');
          await expect(page.getByText('Couldn’t check who’s nearby just now.')).toBeVisible();
          await expect(page.getByText('No one else is sharing near you right now.')).toBeHidden();
          await expect(page.getByText('Can’t say who’s around until the nearby check goes through.')).toBeVisible();
        } finally {
          await page.unroute('**/map');
          await page.getByRole('button', { name: 'Stop' }).click();
        }
      },
      SHARING_FROM,
    );
  });

  test.describe('with browser storage blocked', () => {
    /** localStorage throws, as it does in Safari private windows or with site data blocked. */
    async function blockStorage(page: Page) {
      await page.context().addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('The operation is insecure.', 'SecurityError');
          },
        });
      });
    }

    test('Settings tips and the map say what they can, and nothing throws', async ({ browser }) => {
      const account = await createAccount({ handle: unique('e2ebs'), name: 'Bo Blocked' });

      await asAccount(
        browser,
        account,
        async (page) => {
          const errors: string[] = [];
          page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
          await blockStorage(page);

          // G48: "show the checklist again" can't be remembered, and says so.
          await page.goto('/settings');
          await page.getByRole('button', { name: 'Show the getting-started checklist again' }).click();
          await expect(
            page.getByText('This browser isn’t letting Switchboard remember that'),
          ).toBeVisible();

          await page.goto('/');
          await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

          await page.goto('/map');
          await expect(page.getByRole('combobox', { name: 'Show people' })).toHaveValue('5000');
          await page.getByRole('combobox', { name: 'Show people' }).selectOption('1000');
          await expect(page.getByRole('combobox', { name: 'Show people' })).toHaveValue('1000');

          expect(errors).toEqual([]);
        },
        {},
      );
    });

    // FindableNudge once read localStorage unguarded, so /people threw here and
    // the "Friends can't find you yet" nudge never appeared.
    test('People still shows the findability nudge, and nothing throws', async ({ browser }) => {
      const account = await createAccount({ handle: unique('e2ebp'), name: 'Pip People' });

      await asAccount(browser, account, async (page) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
        await blockStorage(page);
        await page.goto('/people');
        await expect(page.getByText('Friends can’t find you yet')).toBeVisible();
        expect(errors).toEqual([]);
      });
    });
  });
});
