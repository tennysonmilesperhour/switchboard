import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * A2's screenshot was the final Review step in Everyone at once mode. These
 * journeys stop at the edited draft: they never press Send invitations.
 * Run only against the seeded local Supabase/app (see e2e/README.md).
 */
const password = process.env.E2E_TEST_PASSWORD ?? 'testpassword123';
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
const sessions = new Map<string, Awaited<ReturnType<BrowserContext['cookies']>>>();

async function login(page: Page) {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').origin;
  const cached = sessions.get(origin);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto('/profile');
    await expect(page.getByText('@e2ehost', { exact: true }).first()).toBeVisible();
    return;
  }
  await page.goto('/login');
  await page.getByPlaceholder('email or username').fill('e2ehost');
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto('/profile');
  await expect(page.getByText('@e2ehost', { exact: true }).first()).toBeVisible();
  sessions.set(origin, await page.context().cookies());
}

async function advance(page: Page) {
  const step = page.getByText(/Step \d+ of \d+/);
  const before = await step.innerText();
  const next = page.getByRole('button', { name: 'Next', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(step).not.toHaveText(before);
}

async function reviewDraft(page: Page, individual: boolean) {
  await page.goto('/events/new');
  await page.getByPlaceholder('Coffee downtown, Game night, Saturday hike…').fill('A2 checklist review');
  await page.getByLabel('Details', { exact: true }).fill('Local test draft. No invitations will be sent.');
  await advance(page);
  for (const [name, contact] of [
    ['Signoff Alex', 'signoff-alex@example.test'],
    ['Signoff Blair', 'signoff-blair@example.test'],
  ]) {
    await page.getByPlaceholder('Name (optional)').fill(name);
    await page.getByPlaceholder('@username, email, or phone').fill(contact);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByPlaceholder('@username, email, or phone')).toHaveValue('');
  }
  await expect(page.getByText('2 people selected')).toBeVisible();
  await advance(page);
  if (individual) await page.getByRole('button', { name: /One at a time/ }).click();
  for (let remaining = 0; remaining < 4; remaining += 1) {
    if (await page.getByRole('heading', { name: 'Ready to send', exact: true }).isVisible()) return;
    await advance(page);
  }
  throw new Error('The draft did not reach Review.');
}

test.describe('client checklist A2', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    test.skip(!process.env.E2E_DB, 'requires the seeded local database');
    test.skip(!localHosts.has(new URL(baseURL!).hostname), 'draft verification runs on the local app only');
    test.skip(!localHosts.has(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://not-local.invalid').hostname), 'requires local Supabase, never production');
    await login(page);
  });

  test('the screenshot path switches to a chain and reorders on Review without leaving the step', async ({ page }, testInfo) => {
    await reviewDraft(page, false);
    await expect(page.getByText('Everyone hears at the same moment.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Reorder / })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ask them one at a time instead', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ready to send', exact: true })).toBeVisible();
    await expect(page.getByText('Step 6 of 6')).toBeVisible();

    const list = page.getByRole('list', { name: 'Invitees', exact: true });
    await list.getByRole('button', { name: /^Reorder Signoff Alex\./ }).press('ArrowDown');
    await expect(list.locator(':scope > li').nth(0)).toContainText('Signoff Blair');
    await expect(list.locator(':scope > li').nth(1)).toContainText('Signoff Alex');
    for (const name of ['Signoff Alex', 'Signoff Blair']) {
      // A visually clipped name can make two people indistinguishable on a
      // phone even though DOM text and accessible drag labels are correct.
      const label = list.getByText(name, { exact: true });
      expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth), `${name} is readable without clipping`).toBe(true);
    }
    await expect(page.getByRole('heading', { name: 'Ready to send', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/events\/new(?:\?|$)/);
    const screenshot = testInfo.outputPath('a2-review-keyboard-reordered.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('A2 review after keyboard reorder', { path: screenshot, contentType: 'image/png' });
  });

  test('an individual chain can be dragged and removed directly on its final Review', async ({ page }, testInfo) => {
    await reviewDraft(page, true);
    const list = page.getByRole('list', { name: 'Invitees', exact: true });
    await list.scrollIntoViewIfNeeded();
    const handle = list.getByRole('button', { name: /^Reorder Signoff Alex\./ });
    const handleBox = await handle.boundingBox();
    const lastBox = await list.locator(':scope > li').last().boundingBox();
    expect(handleBox).not.toBeNull();
    expect(lastBox).not.toBeNull();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, lastBox!.y + lastBox!.height * 0.75, { steps: 8 });
    await page.mouse.up();
    await expect(list.locator(':scope > li').first()).toContainText('Signoff Blair');
    await expect(list.locator(':scope > li').last()).toContainText('Signoff Alex');
    const screenshot = testInfo.outputPath('a2-review-drag-reordered.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('A2 review after pointer reorder', { path: screenshot, contentType: 'image/png' });

    await list.getByRole('button', { name: 'Take Signoff Alex off this plan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ready to send', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Invitees', exact: true }).locator(':scope > li')).toHaveCount(1);
    await expect(page).toHaveURL(/\/events\/new(?:\?|$)/);
  });
});
