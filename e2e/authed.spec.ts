import { expect, test, type Page } from '@playwright/test';

/**
 * Authenticated journeys. These need a running app pointed at a Supabase that
 * has the migrations applied and the e2e fixtures seeded (see e2e/README.md),
 * so they are gated behind E2E_DB=1 and skipped in the default CI run (which has
 * no database). Fixture users come from e2e/seed.mjs.
 */
const DB = !!process.env.E2E_DB;
const PASSWORD = 'testpassword123';

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByPlaceholder('email or username').fill(identifier);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
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
    await expect(
      page.getByPlaceholder('Coffee downtown, Game night, Saturday hike…'),
    ).toBeVisible();
  });

  test('a host can create a plan with a guest and land on the event page', async ({ page }) => {
    await login(page, 'e2ehost');
    await page.goto('/events/new');
    await page
      .getByPlaceholder('Coffee downtown, Game night, Saturday hike…')
      .fill('E2E test plan');

    // Walk the wizard: add a guest when that step appears, otherwise advance,
    // until the final submit button shows, then send.
    const submit = page.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    for (let i = 0; i < 8 && !(await submit.isVisible()); i += 1) {
      const guestName = page.getByPlaceholder('Guest name');
      if (await guestName.isVisible()) {
        await guestName.fill('Casey Guest');
        await page.getByPlaceholder('Email or phone (optional)').fill('casey@example.com');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
      }
      const next = page.getByRole('button', { name: 'Next' });
      if (await next.isEnabled().catch(() => false)) await next.click();
      else break;
    }

    await submit.click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(page.getByText('E2E test plan')).toBeVisible();
  });
});
