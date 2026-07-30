import { expect, test, type Page, type Browser } from '@playwright/test';

/**
 * The invite-link contract.
 *
 * Shared event links broke for recipients five times in a row, and every fix
 * was verified by reasoning about the code rather than by walking the journey
 * that actually fails: a host produces a link inside the app, sends it, and
 * someone who is NOT signed in — and has no account — taps it.
 *
 * That is what these tests do. Each one takes a link out of the real host UI
 * (never a URL assembled by the test) and opens it in a FRESH browser context
 * with no cookies and no session, which is the closest thing to a phone that
 * has never heard of Switchboard.
 *
 * The contract has two halves, and both are asserted here:
 *   - READING is open. The plan renders for a signed-out stranger. A sign-in
 *     wall, an error, or "this link isn't active" is a failed contract.
 *   - ANSWERING takes an account. Where the buttons would be, a signed-out
 *     visitor gets a sign-in step that carries them back to this same
 *     invitation to answer.
 *
 * If you add a new way to hand someone a link, add it here.
 */

const DB = !!process.env.E2E_DB;
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'testpassword123';
const TITLE = 'Coffee downtown, Game night, Saturday hike…';

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByPlaceholder('email or username').fill(identifier);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
}

async function currentWizardStep(page: Page) {
  const text = await page.getByText(/Step \d+ of \d+/).textContent();
  const match = text?.match(/Step (\d+) of (\d+)/);
  if (!match) throw new Error(`Could not read wizard step from "${text}"`);
  return { current: Number(match[1]), total: Number(match[2]) };
}

/** Create a published plan as the host and return its event page URL. */
async function createPlan(
  page: Page,
  title: string,
  details?: { where?: string; what?: string },
): Promise<string> {
  await page.goto('/events/new');
  await page.getByPlaceholder(TITLE).fill(title);
  if (details?.where) {
    await page.getByPlaceholder('Café Luna, my place, Miller Park…').fill(details.where);
  }
  if (details?.what) {
    await page.locator('#description').fill(details.what);
  }

  const submit = page.getByRole('button', {
    name: /Send invitations|Create & start deciding/,
  });
  for (let i = 0; i < 6; i += 1) {
    const { current, total } = await currentWizardStep(page);
    if (current === total) break;
    if (current === 3) {
      await page.getByRole('button', { name: /E2E Guest/ }).click();
      await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
    }
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await expect(next).toBeEnabled({ timeout: 5_000 });
    await next.click();
    await expect(page.getByText(`Step ${current + 1} of ${total}`)).toBeVisible({
      timeout: 5_000,
    });
  }

  await expect(submit).toBeVisible({ timeout: 5_000 });
  await submit.click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
  return page.url();
}

/**
 * The link the host would actually send: read out of the Invite link card the
 * same way a host reads it, rather than constructed by the test.
 */
async function readShareLink(page: Page): Promise<string> {
  const card = page.locator('section', { has: page.getByText('Invite link') });
  const shown = card.getByRole('link').filter({ hasText: /^https?:\/\// }).first();
  await expect(shown).toBeVisible({ timeout: 10_000 });
  const url = await shown.getAttribute('href');
  if (!url) throw new Error('Invite link card exposed no clickable URL');
  await expect(shown).toHaveAttribute('target', '_blank');
  await expect(shown).toHaveAttribute('rel', /noopener/);
  return url;
}

/** Open a URL with no cookies and no session — a stranger's phone. */
async function asStranger<T>(
  browser: Browser,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

test.describe('invite link contract', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'host journeys run against the desktop app shell');

  test('the host share link is absolute and points at the canonical origin', async ({
    page,
    baseURL,
  }) => {
    await login(page, 'e2ehost');
    await createPlan(page, 'Link shape plan');
    const link = await readShareLink(page);

    // A relative path or a link stamped with a preview/`www` host is the exact
    // shape that arrives dead in a text message.
    expect(link).toMatch(/^https?:\/\//);
    const expected = process.env.NEXT_PUBLIC_APP_URL ?? baseURL ?? '';
    if (expected) {
      expect(new URL(link).origin).toBe(new URL(expected).origin);
    }
  });

  test('a stranger can read the plan, and is asked to sign in to answer', async ({
    page,
    browser,
  }) => {
    await login(page, 'e2ehost');
    await createPlan(page, 'Stranger RSVP plan');
    const link = await readShareLink(page);

    await asStranger(browser, async (stranger) => {
      await stranger.goto(link);

      // Half one: the plan is visible, immediately, with no sign-in wall.
      await expect(
        stranger.getByRole('heading', { name: 'Stranger RSVP plan' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(stranger).not.toHaveURL(/\/(welcome|login)/);
      await expect(stranger.getByText('isn’t active')).toHaveCount(0);

      // Half two: answering asks for an account — and the way in is right here,
      // carrying a return path to this invitation rather than a generic home.
      await expect(
        stranger.getByRole('heading', { name: 'Sign in to RSVP' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(stranger.getByRole('button', { name: /I.?m in/ })).toHaveCount(0);

      const signIn = stranger.getByRole('link', { name: 'Sign in' });
      await expect(signIn).toHaveAttribute(
        'href',
        `/login?next=${encodeURIComponent(new URL(link).pathname)}`,
      );
      await signIn.click();
      await stranger.waitForURL(/\/login/, { timeout: 15_000 });
    });
  });

  test('a signed-in recipient can RSVP straight from the share link', async ({
    page,
    browser,
  }) => {
    await login(page, 'e2ehost');
    await createPlan(page, 'Signed-in RSVP plan');
    const link = await readShareLink(page);

    // A different account, a different device, holding only the texted link.
    await asStranger(browser, async (recipient) => {
      await login(recipient, 'e2eguest');
      await recipient.goto(link);
      await expect(
        recipient.getByRole('heading', { name: 'Signed-in RSVP plan' }),
      ).toBeVisible({ timeout: 15_000 });

      await recipient.getByRole('button', { name: /I.?m in/ }).click();

      // They land on their own durable RSVP page, confirmed.
      await recipient.waitForURL(/\/rsvp\/[0-9a-f-]{36}/, { timeout: 15_000 });
      await expect(recipient.getByText(/You.?re in/)).toBeVisible({ timeout: 15_000 });
    });
  });

  test('the plan the host filled in is what the recipient reads', async ({
    page,
    browser,
  }) => {
    const where = 'Miller Park pavilion 3';
    const what = 'Burgers on us — bring a chair.\nParking is off the north lot.';
    await login(page, 'e2ehost');
    await createPlan(page, 'Detailed plan', { where, what });
    const link = await readShareLink(page);

    // The bug this guards: an invitation that arrives as a title, a date, and
    // two buttons — with the location and details the host typed nowhere on it.
    await asStranger(browser, async (stranger) => {
      await stranger.goto(link);
      await expect(
        stranger.getByRole('heading', { name: 'Detailed plan' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(stranger.getByText(where)).toBeVisible({ timeout: 15_000 });
      await expect(stranger.getByText(/Burgers on us/)).toBeVisible();
      // Both lines of a multi-line description survive to the guest.
      await expect(stranger.getByText(/Parking is off the north lot/)).toBeVisible();
      // And they can put it on a calendar without an account.
      await expect(
        stranger.getByRole('link', { name: /Google Calendar/ }),
      ).toBeVisible();
    });
  });

  test('the shared link survives a reopen — it is durable, not one-shot', async ({
    page,
    browser,
  }) => {
    await login(page, 'e2ehost');
    await createPlan(page, 'Durable link plan');
    const link = await readShareLink(page);

    // Two different strangers, two fresh devices, same link: each one still gets
    // the plan and a live way to answer.
    for (let i = 0; i < 2; i += 1) {
      await asStranger(browser, async (stranger) => {
        await stranger.goto(link);
        await expect(
          stranger.getByRole('heading', { name: 'Durable link plan' }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          stranger.getByRole('heading', { name: 'Sign in to RSVP' }),
        ).toBeVisible({ timeout: 15_000 });
      });
    }
  });

  test('a per-person guest link also opens for a signed-out recipient', async ({
    page,
    browser,
  }) => {
    await login(page, 'e2ehost');
    await page.goto('/events/new');
    await page.getByPlaceholder(TITLE).fill('Guest link plan');

    const submit = page.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    for (let i = 0; i < 6; i += 1) {
      const { current, total } = await currentWizardStep(page);
      if (current === total) break;
      if (current === 3) {
        await page.getByPlaceholder('Name (optional)').fill('Casey Guest');
        await page.getByPlaceholder('@username, email, or phone').fill('casey@example.com');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
      const next = page.getByRole('button', { name: 'Next', exact: true });
      await expect(next).toBeEnabled({ timeout: 5_000 });
      await next.click();
    }
    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // The host copies the guest's own RSVP link out of the guest-links list —
    // read the real URL off the Copy button rather than reconstructing it.
    const guestRow = page.locator('li', { hasText: 'casey@example.com' });
    await expect(guestRow).toBeVisible({ timeout: 10_000 });
    const guestLink = await guestRow.locator('button[title^="http"]').getAttribute('title');
    expect(guestLink).toMatch(/^https?:\/\/.+\/rsvp\/[0-9a-f-]{36}$/);

    await asStranger(browser, async (stranger) => {
      await stranger.goto(guestLink!);
      await expect(
        stranger.getByRole('heading', { name: 'Guest link plan' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(stranger).not.toHaveURL(/\/(welcome|login)/);

      // Same two halves as the public link, so a recipient never has to work out
      // which kind of link they were sent: the plan reads, the answer signs in.
      await expect(
        stranger.getByRole('heading', { name: 'Sign in to RSVP' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(stranger.getByRole('button', { name: /I.?m in/ })).toHaveCount(0);
    });
  });
});

test.describe('invite link contract (no database)', () => {
  test('an unknown share token fails gracefully instead of erroring', async ({ page }) => {
    await page.goto('/i/00000000-0000-0000-0000-000000000000');
    // Never a sign-in wall: the route must stay public even when the token is
    // meaningless, or a mistyped link becomes a signup funnel.
    await expect(page).not.toHaveURL(/\/(welcome|login)/);
    await expect(page.getByText('isn’t active')).toBeVisible({ timeout: 15_000 });
  });

  test('the share route is public — it never redirects a signed-out visitor', async ({
    page,
  }) => {
    const response = await page.goto('/i/00000000-0000-0000-0000-000000000000');
    expect(response?.status()).toBeLessThan(400);
    expect(new URL(page.url()).pathname).toMatch(/^\/i\//);
  });
});
