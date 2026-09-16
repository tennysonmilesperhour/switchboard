import { expect, test } from '@playwright/test';

test.describe('public surface', () => {
  test('landing hero loads', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Make plans.');
  });

  test('Create account opens the create tab', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('link', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/login\?mode=create/);
    await expect(page.getByLabel('Your name')).toBeVisible();
  });

  test('unauthenticated app routes redirect to welcome', async ({ page }) => {
    await page.goto('/plans');
    await expect(page).toHaveURL(/\/welcome/);
  });

  /*
    The app invite link — `appInviteUrl()` in src/lib/links.ts, the bare origin
    with no plan and no token. It joined the link contract without joining this
    file, and the contract's own instruction is that every link in it is opened
    here signed out. These are that: what the recipient of a texted app link
    gets, on a device with no session.
  */
  test('the app invite link opens the pitch for someone with no account', async ({
    page,
  }) => {
    // Exactly what a recipient taps: the origin, nothing appended.
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.locator('h1')).toContainText('Make plans.');
    // It has to offer a way in, or the link is a leaflet.
    await expect(page.getByRole('link', { name: 'Create account' }).first()).toBeVisible();
  });

  test('the app invite link unfurls as a card, not a bare URL', async ({ page }) => {
    await page.goto('/');
    // A link built to be dropped into a text message is only working if the
    // messaging app can render it. Every other link in the contract sets these.
    const og = (property: string) =>
      page.locator(`meta[property="og:${property}"]`).first();
    await expect(og('title')).toHaveAttribute('content', /Switchboard/);
    await expect(og('description')).toHaveAttribute('content', /.{40,}/);
    await expect(og('image')).toHaveAttribute('content', /^https?:\/\/.+/);

    // The page's plain-string title went through the root layout's
    // '%s · Switchboard' template, so the preview headline and the browser tab
    // both read "Switchboard - plans without pressure · Switchboard".
    await expect(page).toHaveTitle('Switchboard - plans without pressure');
  });

  test('unknown guest RSVP token shows a graceful message', async ({ page }) => {
    await page.goto('/rsvp/00000000-0000-0000-0000-000000000000');
    await expect(page.getByText('isn’t here anymore')).toBeVisible();
  });

  test('crawler metadata stays public', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('application/xml');
    expect(page.url()).toMatch(/\/sitemap\.xml$/);
  });

  test('no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/welcome');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('sign-in failure always returns visible feedback', async ({ page }) => {
    await page.goto('/login');
    const submit = page.locator('form').getByRole('button', { name: 'Sign in', exact: true });
    await expect(submit).toBeEnabled();
    await page.getByLabel('Email or username').fill('invalid!');
    await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
    await submit.click();
    const feedback = page.getByText(
      'That email, username, or password did not work.',
      { exact: true },
    );
    await expect(feedback).toBeVisible({ timeout: 20_000 });
    await expect(submit).toBeEnabled();
  });

  test('password recovery and legal pages are reachable', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Notice' })).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Use' })).toBeVisible();
  });

  /*
    The scope checklist the client is given a link to. Its whole list is drawn
    by one inline script, so the two ways it breaks are both invisible to the
    server: a parse error in that script, and a CSP that blocks it because the
    per-request nonce went missing. Either one serves a clean 200 carrying the
    full text of every item, draws the header, counters and progress bar from
    the static markup, and renders no list at all. Both have now happened.

    A fetch cannot tell the difference, so this opens it in a browser and
    counts what a reader would actually see.
  */
  test('the scope checklist renders its list, not just its header', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    const response = await page.goto('/scope-verification');
    expect(response?.status()).toBe(200);

    // Signed out on purpose: the client opens this without an account.
    await expect(page.getByRole('heading', { name: 'Scope of Work Verification' })).toBeVisible();

    // The list is the page. One section with items in it proves the script
    // parsed, was allowed to run, and drew something.
    await expect(page.locator('.group').first()).toBeVisible();
    expect(await page.locator('.group').count()).toBeGreaterThan(1);
    expect(await page.locator('.item').count()).toBeGreaterThan(1);
    await expect(page.locator('.chk').first()).toBeVisible();

    // A blocked or broken script leaves the running total at its static zero.
    await expect(page.locator('#revTotal')).not.toHaveText('0');

    expect(pageErrors, `the checklist script threw: ${pageErrors.join('; ')}`).toEqual([]);
  });
});
