import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminClient, DB, expectToast, login, unique } from './support';

/**
 * Places: Explore, the map, zones, moments and boards — the surfaces that
 * reveal themselves last and that no journey used to touch (completion plan
 * Q4). Each test is a person doing the thing and seeing what it did.
 *
 * Fixture users come from e2e/seed.mjs (e2ehost, e2eguest; accepted friends).
 * Every name is unique per run, so a re-run against the same database, or two
 * journeys at once, never find each other's zones or boards.
 */

/** A second person on a second device. */
async function asPerson<T>(
  browser: Browser,
  identifier: string,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await login(page, identifier);
    return await fn(page);
  } finally {
    await context.close();
  }
}

/** Answer the app's own confirm dialog. */
async function confirmDialog(page: Page, title: string | RegExp, button: string) {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: button, exact: true }).click();
}

/** Create a zone through the /zones form and land on its page; returns its slug. */
async function createZone(
  page: Page,
  name: string,
  { description, visibility }: { description: string; visibility: 'public' | 'private' },
): Promise<string> {
  await page.goto('/zones');
  const form = page.locator('form', { has: page.getByRole('button', { name: 'Create zone' }) });
  await form.getByLabel('Zone name').fill(name);
  await form.getByLabel('Zone description').fill(description);
  if (visibility === 'private') {
    await form.locator('label', { hasText: 'Only people I let in' }).click();
  }
  await form.getByRole('button', { name: 'Create zone' }).click();
  await page.waitForURL(/\/zones\/[^/?]+$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: name, level: 1 })).toBeVisible();
  return new URL(page.url()).pathname.split('/').pop()!;
}

/** Search /zones the way a person does: the box, then Search. */
async function searchZones(page: Page, query: string) {
  await page.goto('/zones');
  await page.getByLabel('Search zones').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForURL(/\/zones\?q=/);
}

test.describe('places', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'authenticated journeys run against the desktop app shell');

  test('Explore suggests things to do, and one becomes a plan', async ({ page }) => {
    await login(page, 'e2ehost');
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: "What's the move?" })).toBeVisible();

    await page.getByLabel('Where?').fill('Denver');
    await page.getByLabel('When?').fill('Saturday afternoon');
    await page.getByRole('button', { name: /Find something great/ }).click();

    // With no AI key configured the page says it is showing starters (D25)
    // rather than passing them off as tailored — and still gives real ideas.
    const ideas = page.getByRole('region', { name: 'Recommendations' });
    await expect(ideas).toBeVisible({ timeout: 20_000 });
    const firstIdea = ideas.getByRole('heading', { level: 3 }).first();
    const title = (await firstIdea.innerText()).trim();
    expect(title.length).toBeGreaterThan(0);

    // "Make it a plan" carries the idea into the wizard, already titled.
    await ideas.getByRole('link', { name: /Make it a plan/ }).first().click();
    await page.waitForURL(/\/events\/new\?/);
    await expect(page.getByPlaceholder('Coffee downtown, Game night, Saturday hike…')).toHaveValue(
      title,
    );
  });

  test('the map draws a zone, and its layer switches off and on', async ({ page }) => {
    // Arranged, not walked: the place picker geocodes against a public service
    // the test environment cannot reach. The zone itself is ordinary.
    const name = unique('Map Zone ');
    const slug = unique('map-zone-');
    await login(page, 'e2ehost');
    const { data: host } = await adminClient()
      .from('profiles')
      .select('id')
      .eq('handle', 'e2ehost')
      .single();
    const { error } = await adminClient()
      .from('zones')
      .insert({
        slug,
        name,
        organizer_id: host!.id,
        visibility: 'public',
        latitude: 39.7392,
        longitude: -104.9903,
        ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
    expect(error, error?.message).toBeNull();

    await page.goto('/map');
    await expect(page.locator('.maplibregl-map')).toBeVisible();

    const layers = page.getByRole('group', { name: 'Map layers' });
    const zonesLayer = layers.getByRole('button', { name: /Zones/ });
    await expect(zonesLayer).toHaveAttribute('aria-pressed', 'true');

    const pin = page.locator(`.sb-map-pin[title="${name}"]`);
    const listed = page.getByRole('button', { name: `Show ${name} on the map` });
    await expect(pin).toBeVisible();
    await expect(listed).toBeVisible();

    await zonesLayer.click();
    await expect(zonesLayer).toHaveAttribute('aria-pressed', 'false');
    await expect(pin).toHaveCount(0);
    await expect(listed).toHaveCount(0);

    await zonesLayer.click();
    await expect(zonesLayer).toHaveAttribute('aria-pressed', 'true');
    await expect(pin).toBeVisible();

    // Its row flies the map to it, and "Open" goes to the zone itself.
    await listed.click();
    await page
      .locator('li', { has: listed })
      .getByRole('link', { name: 'Open' })
      .click();
    await page.waitForURL(new RegExp(`/zones/${slug}$`));
    await expect(page.getByRole('heading', { name: name, level: 1 })).toBeVisible();
  });

  test('an organizer opens a public zone, and a neighbour finds it and checks in', async ({
    page,
    browser,
  }) => {
    const name = unique('Open Fair ');
    await login(page, 'e2ehost');
    const slug = await createZone(page, name, {
      description: 'Stalls by the river, all weekend.',
      visibility: 'public',
    });
    await expect(page.getByText('Public', { exact: true })).toBeVisible();

    await asPerson(browser, 'e2eguest', async (guest) => {
      await searchZones(guest, name);
      await guest.getByRole('link', { name: new RegExp(name) }).click();
      await guest.waitForURL(new RegExp(`/zones/${slug}$`));
      await expect(guest.getByText('Be the first to check in.', { exact: false })).toBeVisible();

      // Checking in to the zone is a moment tied to it.
      await guest.getByRole('button', { name: /Coffee Conversation/ }).click();
      await guest.getByRole('button', { name: /Check in to the zone/ }).click();
      await guest.waitForURL(/\/moments$/);
      await expect(guest.getByText('Checked in', { exact: true })).toBeVisible();
      await expect(guest.getByText(name).first()).toBeVisible();

      await guest.goto(`/zones/${slug}`);
      await expect(guest.getByText(/You’re checked in here/)).toBeVisible();

      // And checking out ends it.
      await guest.goto('/moments');
      await guest.getByRole('button', { name: 'Check out', exact: true }).click();
      await expect(guest.getByLabel('Where are you?')).toBeVisible();
      await guest.goto(`/zones/${slug}`);
      await expect(guest.getByText('Be the first to check in.', { exact: false })).toBeVisible();
    });
  });

  test('a private zone: hidden from search, asked into, let in, and left', async ({
    page,
    browser,
  }) => {
    const name = unique('Offsite ');
    await login(page, 'e2ehost');
    const slug = await createZone(page, name, {
      description: 'The team retreat.',
      visibility: 'private',
    });
    await expect(page.getByText('Private zone', { exact: true })).toBeVisible();

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    try {
      await login(guest, 'e2eguest');

      // Search never shows a private zone to someone outside it.
      await searchZones(guest, name);
      await expect(guest.getByText(`No open zone matches “${name}”.`, { exact: false })).toBeVisible();
      await expect(guest.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);

      // Its address is a door to knock on, not a 404.
      await guest.goto(`/zones/${slug}`);
      await expect(guest.getByRole('heading', { name: `${name} is private` })).toBeVisible();
      await guest.getByLabel('Add a note for the organizer').fill('I’m on the team!');
      await guest.getByRole('button', { name: 'Ask to join' }).click();
      await expectToast(guest, 'Asked.');
      await expect(guest.getByText('You’ve asked to join.', { exact: false })).toBeVisible();

      // The organizer sees the request, with the note, and lets them in.
      await page.goto(`/zones/${slug}`);
      const request = page.locator('li', { hasText: 'I’m on the team!' });
      await expect(request).toContainText('E2E Guest');
      await request.getByRole('button', { name: 'Let in' }).click();
      await expectToast(page, 'They’re in.');

      // The guest is in: the zone itself, and a way back out.
      await guest.reload();
      await expect(guest.getByRole('heading', { name: name, level: 1 })).toBeVisible();
      await expect(guest.getByText('Private zone', { exact: true })).toBeVisible();
      await guest.getByRole('button', { name: 'Leave zone' }).click();
      await confirmDialog(guest, `Leave ${name}?`, 'Leave zone');
      await expectToast(guest, `You left ${name}.`);
      await guest.waitForURL(/\/zones$/);

      // Leaving is not held against them: the door offers a fresh ask.
      await guest.goto(`/zones/${slug}`);
      await expect(guest.getByRole('heading', { name: `${name} is private` })).toBeVisible();
      await expect(guest.getByRole('button', { name: 'Ask to join' })).toBeVisible();
    } finally {
      await guestContext.close();
    }
  });

  test('a moment: check in somewhere, then check out', async ({ page }) => {
    const place = unique('Gate B');
    await login(page, 'e2ehost');
    await page.goto('/moments');

    // One open check-in at a time. If an earlier run left one, end it first so
    // this journey starts where a person arriving somewhere new would.
    const checkOut = page.getByRole('button', { name: 'Check out', exact: true });
    const where = page.getByLabel('Where are you?');
    await expect(checkOut.or(where)).toBeVisible();
    if (await checkOut.isVisible()) {
      await checkOut.click();
      await expect(where).toBeVisible();
    }

    await where.fill(place);
    await page.getByRole('button', { name: /Book Discussion/ }).click();
    await page.getByLabel(/A line about you/).fill('Reading anything good?');
    await page.getByRole('button', { name: 'Check in', exact: true }).click();

    await expect(page.getByText('Checked in', { exact: true })).toBeVisible();
    await expect(page.getByText(place)).toBeVisible();
    await expect(page.getByText(/Book Discussion · ends/)).toBeVisible();

    // It survives a reload — it is saved, not just drawn.
    await page.reload();
    await expect(page.getByText(place)).toBeVisible();

    await checkOut.click();
    await expect(where).toBeVisible();
    await expect(page.getByText(place)).toHaveCount(0);
  });

  test('a board: start it, post, add a neighbour, who posts and leaves', async ({
    page,
    browser,
  }) => {
    const name = unique('Maple Street ');
    const notice = unique('Ladder to lend ');
    const reply = unique('Thanks neighbour ');
    await login(page, 'e2ehost');

    await page.goto('/boards');
    await page.getByLabel('Board name').fill(name);
    await page.getByLabel('Board description').fill('Our block.');
    await page.getByRole('button', { name: 'Create board' }).click();
    await page.waitForURL(/\/boards\/[^/?]+$/, { timeout: 15_000 });
    const boardUrl = page.url();
    await expect(page.getByRole('heading', { name: name, level: 1 })).toBeVisible();

    await page.getByLabel('Title').fill(notice);
    await page.getByLabel('Details').fill('Six foot, by the garage.');
    await page.getByRole('button', { name: 'Post to the board' }).click();
    await expectToast(page, 'Posted to the board.');
    await expect(page.getByText(notice)).toBeVisible();

    // The founder is its only moderator, so the board says why they can't
    // simply leave instead of offering a button that would fail.
    await expect(page.getByText(/You’re the only one here|You’re the only moderator/)).toBeVisible();

    await page.getByLabel('Invite by handle').fill('e2eguest');
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    await expectToast(page, 'Added @e2eguest.');

    await asPerson(browser, 'e2eguest', async (guest) => {
      await guest.goto('/boards');
      await guest.getByRole('link', { name: new RegExp(name) }).click();
      await guest.waitForURL(boardUrl);
      await expect(guest.getByText(notice)).toBeVisible();

      await guest.getByLabel('Title').fill(reply);
      await guest.getByRole('button', { name: 'Post to the board' }).click();
      await expectToast(guest, 'Posted to the board.');
      await expect(guest.getByText(reply)).toBeVisible();

      await guest.getByRole('button', { name: 'Leave this board' }).click();
      await confirmDialog(guest, `Leave ${name}?`, 'Leave board');
      await expectToast(guest, `You left ${name}.`);
      await guest.waitForURL(/\/boards$/);
      await expect(guest.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);

      // Gone means gone: the board's address no longer opens for them.
      await guest.goto(boardUrl);
      await expect(guest.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    });

    // What they posted stays for the neighbours who remain.
    await page.reload();
    await expect(page.getByText(reply)).toBeVisible();
    await expect(page.getByText('1 neighbor', { exact: true })).toBeVisible();
  });
});
