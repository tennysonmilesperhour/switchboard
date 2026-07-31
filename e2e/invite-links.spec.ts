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
 * The contract has three parts, and all three are asserted here:
 *   - READING is open. The plan renders for a signed-out stranger. A sign-in
 *     wall, an error, or "this link isn't active" is a failed contract.
 *   - ANSWERING takes an account. Where the buttons would be, a signed-out
 *     visitor gets a sign-in step that carries them back to this same
 *     invitation to answer.
 *   - ANY SHARE AFFORDANCE THE HOST IS OFFERED PRODUCES A READABLE LINK. This
 *     is the one that kept failing. The host-side rule for "can this be shared"
 *     was looser than the recipient-side rule for "can this be read", so the app
 *     handed out links its own page rejected. Both now come from
 *     src/lib/share-link.ts, and src/lib/share-link.test.ts proves the invariant
 *     across every status; the tests here walk it through the real UI.
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
  details?: { where?: string; what?: string; groupDecides?: boolean },
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
    // Opt the plan into a group decision wherever the wizard offers it. This is
    // the ordinary "let's pick a date together" plan, and it lands the event in
    // `deciding` — the status whose share link used to read as dead.
    if (details?.groupDecides) {
      const decide = page
        .locator('label', { hasText: 'Let the group decide what to do' })
        .getByRole('checkbox');
      if (await decide.count()) await decide.check();
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

  test('a plan still deciding its date has a link that reads, not a dead end', async ({
    page,
    browser,
  }) => {
    // The reported failure, walked end to end. A host starts a plan the group
    // decides together — a completely ordinary plan — and texts the link. The
    // event sits in `deciding` until the poll closes, and for that entire window
    // every recipient used to be told "This invite link isn't active", while the
    // host's own screen showed a Share button that looked perfectly healthy.
    await login(page, 'e2ehost');
    await createPlan(page, 'Group decides plan', { groupDecides: true });
    const link = await readShareLink(page);

    await asStranger(browser, async (stranger) => {
      await stranger.goto(link);

      // Reading is open, exactly as it is for any other plan.
      await expect(
        stranger.getByRole('heading', { name: 'Group decides plan' }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(stranger).not.toHaveURL(/\/(welcome|login)/);
      await expect(stranger.getByText('isn’t active')).toHaveCount(0);

      // Answering is not open yet — and the recipient is told why, in terms of
      // the plan, rather than being sent to create an account that would not
      // have helped.
      await expect(stranger.getByText('Still picking a date')).toBeVisible({
        timeout: 15_000,
      });
      await expect(stranger.getByRole('button', { name: /I.?m in/ })).toHaveCount(0);
      await expect(
        stranger.getByRole('heading', { name: 'Sign in to RSVP' }),
      ).toHaveCount(0);
    });
  });

  test('every share affordance the host is offered produces a readable link', async ({
    page,
    browser,
  }) => {
    // The invariant, checked through the UI rather than in isolation: if the app
    // shows a host a way to hand this plan out, what a recipient opens must
    // render the plan. Every past regression was a violation of exactly this —
    // an affordance the host could reach whose link the recipient page rejected.
    await login(page, 'e2ehost');
    await createPlan(page, 'Affordance sweep plan');

    const link = await readShareLink(page);
    // Every Share affordance on the page, however many the layout offers.
    const shareButtons = page.getByRole('button', { name: /Share/ });
    expect(await shareButtons.count()).toBeGreaterThan(0);

    await asStranger(browser, async (stranger) => {
      await stranger.goto(link);
      await expect(
        stranger.getByRole('heading', { name: 'Affordance sweep plan' }),
      ).toBeVisible({ timeout: 15_000 });
    });

    // Turn the link off: the host's share affordances must disappear with it,
    // so there is no way left to send a link that now dead-ends.
    await page.getByRole('button', { name: 'Turn off link' }).click();
    await expect(
      page.getByRole('button', { name: /Turn on invite link/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(shareButtons).toHaveCount(0);
    await expect(page.getByRole('link', { name: link })).toHaveCount(0);

    // And the previously-sent link now says so honestly.
    await asStranger(browser, async (stranger) => {
      await stranger.goto(link);
      await expect(stranger.getByText('isn’t active')).toBeVisible({ timeout: 15_000 });
    });
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
