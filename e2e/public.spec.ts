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

  /*
    The shared board. Progress used to live in localStorage and nowhere else,
    so the person who sent the link could never see what the client had ticked.
    It is server-side now, which introduces a failure mode worth pinning: when
    the board is unreachable the page must still render and still be usable,
    just not shared.

    The smoke job runs with no Supabase env, so /api/scope-progress answers 503
    here. That is exactly the degraded case — assert the list survives it.
  */
  test('the checklist survives an unreachable shared board', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    await page.goto('/scope-verification');

    // The list still draws from the local copy.
    expect(await page.locator('.item').count()).toBeGreaterThan(1);
    await expect(page.locator('#revTotal')).not.toHaveText('0');

    // The board's own furniture is present either way.
    await expect(page.getByLabel('Your name')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Notes on this build/ })).toBeVisible();

    // Ticking still works locally and must not throw when the write fails.
    const first = page.locator('.chk').first();
    await first.check();
    await expect(first).toBeChecked();

    expect(
      pageErrors,
      `the board script threw with no server: ${pageErrors.join('; ')}`,
    ).toEqual([]);
  });

  /*
    The board doing its job. This is the whole complaint, so it gets a test that
    does not depend on a database: the endpoint is stubbed, and what is asserted
    is that the page actually renders someone else's progress and someone else's
    notes. Before this change the page could not have shown either, because a
    tick never left the browser that made it.
  */
  test('the checklist shows progress and notes made by someone else', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    const writes: unknown[] = [];
    await page.route('**/api/scope-progress', async (route) => {
      if (route.request().method() === 'POST') {
        writes.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          checked: {
            A1: { at: new Date(Date.now() - 3 * 3600_000).toISOString(), by: 'Gina' },
            A2: { at: new Date(Date.now() - 2 * 3600_000).toISOString(), by: null },
          },
          notes: [
            {
              id: 'n1',
              at: new Date(Date.now() - 90 * 60_000).toISOString(),
              itemId: 'J4',
              itemLabel: 'Signals reach a group',
              body: 'The group picker is empty for me.',
              reporter: 'Gina',
              status: 'needs_you',
              resolution: null,
              screenshots: [],
            },
          ],
        }),
      });
    });

    await page.goto('/scope-verification');

    // Her ticks, in his browser. This is the thing that was impossible before.
    await expect(page.locator('.item-mark').first()).toBeVisible();
    await expect(page.locator('.item-mark').first()).toContainText('Checked by Gina');
    await expect(page.locator('.item-mark').first()).toContainText('hours ago');
    expect(await page.locator('.item-mark').count()).toBe(2);
    // The anonymous one still shows, just without a name.
    await expect(page.locator('.item-mark').nth(1)).toContainText('Checked by Someone');

    // The counters reflect the shared board, not this device.
    await expect(page.locator('#revDone')).toHaveText('2');

    // And her note is readable here, with no account.
    await expect(page.getByText('The group picker is empty for me.')).toBeVisible();
    await expect(page.locator('.note-about').first()).toContainText('J4');
    await expect(page.locator('#notesCount')).toHaveText('1');
    await expect(page.locator('.note-status').first()).toContainText('needs you');

    // A tick here is pushed up rather than kept to itself.
    await page.locator('.chk').nth(5).check();
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    expect(writes[0]).toMatchObject({ checked: true });

    expect(pageErrors, `the board script threw: ${pageErrors.join('; ')}`).toEqual([]);
  });

  /*
    The feedback box on that same page. It is the client's only way to report
    anything — they have no account and are not going to make one — so the
    journey that matters is the whole one: open it from an item, refuse an
    empty note, send a real one, and get told what happened.

    The smoke job deliberately runs with no Supabase env, so the send lands on
    the route's "not configured here" answer rather than saving. That is still
    the round trip worth asserting: form to route and back to a sentence the
    reader can act on. The assertion accepts either outcome so the test does
    not depend on how the job it runs in is configured.
  */
  test('the checklist feedback box opens, validates, and reports what happened', async ({
    page,
  }) => {
    await page.goto('/scope-verification');

    // Opened from a specific item, so the report knows what it is about.
    const reportButton = page.getByRole('button', { name: 'Report a problem' }).first();
    await expect(reportButton).toBeVisible();
    await reportButton.click();

    const panel = page.getByRole('dialog', { name: 'Send feedback' });
    await expect(panel).toBeVisible();
    // The item it came from is named on the panel.
    await expect(page.locator('#fbAbout')).toBeVisible();

    // An empty note is refused here, not at the server.
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('#fbNote')).toHaveText(/write what you saw/i);

    // A real one goes to the route and comes back with an answer either way.
    await page.locator('#fbBody').fill('The Share button does nothing on my phone.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('#fbNote')).toHaveText(
      /sent|didn’t send|isn’t switched on/i,
      { timeout: 20_000 },
    );

    // And there is a way to report something that is not about one item.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(panel).toBeVisible();
    await expect(page.locator('#fbAbout')).toBeHidden();
  });
});
