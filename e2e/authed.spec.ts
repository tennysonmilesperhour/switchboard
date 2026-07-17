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
    timeout: 15_000,
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
  const next = page.getByRole('button', { name: 'Next' });
  await expect(next).toBeEnabled({ timeout: 5_000 });
  await next.click();
  await expect(page.getByText(`Step ${current + 1} of ${total}`)).toBeVisible({
    timeout: 5_000,
  });
}

test.describe('authenticated surface', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');

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
    for (let i = 0; i < 8 && !(await submit.isVisible()); i += 1) {
      const guestName = page.getByPlaceholder('Name (optional)');
      if (await guestName.isVisible().catch(() => false)) {
        await guestName.fill('Casey Guest');
        await page.getByPlaceholder('@username, email, or phone').fill('casey@example.com');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
      }
      if (await page.getByRole('button', { name: 'Next' }).isVisible().catch(() => false)) {
        await clickWizardNext(page);
      } else break;
    }

    await submit.click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(page.getByText('E2E guest plan')).toBeVisible();
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
    for (let i = 0; i < 8 && !(await submit.isVisible()); i += 1) {
      // People step: pick the seeded friend as a real member.
      const friend = host.getByRole('button', { name: /E2E Guest/ });
      if (await friend.isVisible().catch(() => false)) await friend.click();
      if (await host.getByRole('button', { name: 'Next' }).isVisible().catch(() => false)) {
        await clickWizardNext(host);
      } else break;
    }
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
    for (let i = 0; i < 8 && !(await submit.isVisible()); i += 1) {
      // Style step: turn on "let the group decide".
      const pollToggle = page.getByText('Let the group decide what to do 🗳️');
      if (await pollToggle.isVisible().catch(() => false)) await pollToggle.click();
      if (await page.getByRole('button', { name: 'Next' }).isVisible().catch(() => false)) {
        await clickWizardNext(page);
      } else break;
    }
    await submit.click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // The poll renders on the event page in the deciding phase.
    await page.getByRole('textbox', { name: 'Suggest an idea' }).fill('Tacos');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Tacos')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Absolutely love this' }).first().click();
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
