import { expect, test, type Page } from '@playwright/test';

/**
 * Authenticated journeys. These need a running app pointed at a Supabase that
 * has the migrations applied and the e2e fixtures seeded (see e2e/README.md),
 * so they are gated behind E2E_DB=1 and skipped in the default CI run (which has
 * no database). Fixture users come from e2e/seed.mjs: e2ehost ("E2E Host") and
 * e2eguest ("E2E Guest"), who are seeded as accepted friends.
 */
const DB = !!process.env.E2E_DB;
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'testpassword123';
const TITLE = 'Coffee downtown, Game night, Saturday hike…';

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByPlaceholder('email or username').fill(identifier);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  // The page has a "Sign in" mode-toggle tab as well as the form's submit
  // button, both named "Sign in" — scope to the form to click the submit.
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

async function clickWizardNext(page: Page) {
  const { current, total } = await currentWizardStep(page);
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await expect(next).toBeEnabled({ timeout: 5_000 });
  await next.click();
  await expect(page.getByText(`Step ${current + 1} of ${total}`)).toBeVisible({
    timeout: 5_000,
  });
}

async function reachWizardReview(
  page: Page,
  prepareStep?: (step: number) => Promise<void>,
) {
  for (let i = 0; i < 6; i += 1) {
    const { current, total } = await currentWizardStep(page);
    if (current === total) return;
    await prepareStep?.(current);
    await clickWizardNext(page);
  }

  throw new Error('Wizard did not reach the review step');
}

test.describe('authenticated surface', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'authenticated journeys run against the desktop app shell');

  test('a seeded user can sign in and reach an authenticated page', async ({ page }) => {
    await login(page, 'e2ehost');
    // Landed somewhere inside the app (home/onboarding), not bounced to welcome.
    await expect(page).not.toHaveURL(/\/welcome/);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  });

  test('a signed-in user can open the new-plan wizard', async ({ page }) => {
    await login(page, 'e2ehost');
    await page.goto('/events/new');
    await expect(page.getByPlaceholder(TITLE)).toBeVisible();
  });

  test('a host can create a plan with a guest and land on the event page', async ({ page }) => {
    await login(page, 'e2ehost');
    await page.goto('/events/new');
    await page.getByPlaceholder(TITLE).fill('E2E guest plan');

    // Walk the wizard: add a token guest when that step appears, otherwise
    // advance, until the final submit button shows, then send.
    const submit = page.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    await reachWizardReview(page, async (step) => {
      if (step === 3) {
        const guestName = page.getByPlaceholder('Name (optional)');
        await guestName.fill('Casey Guest');
        await page.getByPlaceholder('@username, email, or phone').fill('casey@example.com');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });

    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'E2E guest plan', level: 1 })).toBeVisible();
  });

  // ——— Golden journey 1: create → cascade → accept ———
  test('a host invites a friend and the friend accepts', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await login(host, 'e2ehost');
    await host.goto('/events/new');
    await host.getByPlaceholder(TITLE).fill('Cascade journey plan');

    const submit = host.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    await reachWizardReview(host, async (step) => {
      // People step: pick the seeded friend as a real member.
      if (step === 3) {
        await host.getByRole('button', { name: /E2E Guest/ }).click();
        await expect(host.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });
    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    await host.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const eventUrl = host.url();

    // The invited friend opens the event and accepts. Opening the page advances
    // the cascade, so the RSVP control is present.
    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await login(guest, 'e2eguest');
    await guest.goto(eventUrl);
    await guest.getByRole('button', { name: /I.?m in/ }).click();
    await expect(guest.getByText(/You.?re in/)).toBeVisible({ timeout: 15_000 });

    await hostCtx.close();
    await guestCtx.close();
  });

  // ——— Golden journey 2: create a poll → suggest → vote ———
  test('a host opens a group decision, suggests, and votes', async ({ page }) => {
    await login(page, 'e2ehost');
    await page.goto('/events/new');
    await page.getByPlaceholder(TITLE).fill('Poll journey plan');

    const submit = page.getByRole('button', {
      name: /Create & start deciding|Send invitations/,
    });
    await reachWizardReview(page, async (step) => {
      // Style step: turn on "let the group decide".
      if (step === 2) await page.getByText('Let the group decide what to do 🗳️').click();
      if (step === 3) {
        await page.getByRole('button', { name: /E2E Guest/ }).click();
        await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });
    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // The poll renders on the event page in the deciding phase.
    await page.getByRole('textbox', { name: 'Suggest an idea' }).fill('Tacos');
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();
    await expect(page.getByText('Tacos')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Absolutely love this' }).first().click();
  });

  // ——— Reaching one person on a plan ———
  //
  // The two halves of "tap a profile, contact them": someone with no account,
  // who can only be reached off-platform from what the host typed, and someone
  // who has one, who gets the invitation in the app.

  test('a host can email a guest invitee straight from the plan', async ({ page }) => {
    await login(page, 'e2ehost');
    await page.goto('/events/new');
    await page.getByPlaceholder(TITLE).fill('Guest contact plan');

    const submit = page.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    await reachWizardReview(page, async (step) => {
      if (step === 3) {
        await page.getByPlaceholder('Name (optional)').fill('Casey Guest');
        await page.getByPlaceholder('@username, email, or phone').fill('casey@example.com');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });
    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // Tap them in the invitation flow: their card opens with the address the
    // host typed and a one-tap mail action.
    await page.getByRole('button', { name: /Contact Casey Guest/ }).click();
    await expect(page.getByText('casey@example.com').first()).toBeVisible({
      timeout: 5_000,
    });

    const send = page.getByRole('link', { name: 'Email' });
    await expect(send).toBeVisible();
    const href = (await send.getAttribute('href')) ?? '';
    expect(href.startsWith('mailto:casey%40example.com?')).toBe(true);
    // The prefilled body carries a real, absolute link to the plan — the whole
    // point of sending from here rather than from the phone's contact list.
    expect(decodeURIComponent(href)).toMatch(/https?:\/\/[^\s]+\/(rsvp|i)\//);
  });

  test('a host invites a connection directly and it arrives in the app', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await login(host, 'e2ehost');
    await host.goto('/events/new');
    await host.getByPlaceholder(TITLE).fill('Direct invite plan');

    // Start the plan with a guest, so the seeded friend is still un-invited and
    // therefore offered in the add-people panel.
    const submit = host.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    await reachWizardReview(host, async (step) => {
      if (step === 3) {
        await host.getByPlaceholder('Name (optional)').fill('Casey Guest');
        await host.getByPlaceholder('@username, email, or phone').fill('casey@example.com');
        await host.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(host.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });
    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    await host.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const eventUrl = host.url();

    // Tap the friend in "From your people" and ask them now, ahead of the line.
    await host.getByRole('button', { name: /Open E2E Guest/ }).click();
    await host.getByRole('button', { name: 'Send invite now' }).click();
    await expect(host.getByText(/Invitation sent to E2E Guest/)).toBeVisible({
      timeout: 15_000,
    });

    // It is a real, live invite: the friend can answer it without any link
    // being sent to them.
    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await login(guest, 'e2eguest');
    await guest.goto(eventUrl);
    await guest.getByRole('button', { name: /I.?m in/ }).click();
    await expect(guest.getByText(/You.?re in/)).toBeVisible({ timeout: 15_000 });

    await hostCtx.close();
    await guestCtx.close();
  });

  // ——— Golden journey 3: mutual match between two users ———
  test('two users reach a mutual match', async ({ browser }) => {
    const aCtx = await browser.newContext();
    const a = await aCtx.newPage();
    await login(a, 'e2ehost');
    await a.goto('/mutual');
    await a.getByRole('button', { name: 'Coffee' }).click();
    await a.getByRole('button', { name: /E2E Guest/ }).click();
    await a.getByRole('button', { name: /Down to Connect/ }).click();

    const bCtx = await browser.newContext();
    const b = await bCtx.newPage();
    await login(b, 'e2eguest');
    await b.goto('/mutual');
    await b.getByRole('button', { name: 'Coffee' }).click();
    await b.getByRole('button', { name: /E2E Host/ }).click();
    await b.getByRole('button', { name: /Down to Connect/ }).click();
    // The match surfaces live for the person who completes the pair.
    await expect(b.getByText(/It.?s mutual/)).toBeVisible({ timeout: 15_000 });

    await aCtx.close();
    await bCtx.close();
  });
});
