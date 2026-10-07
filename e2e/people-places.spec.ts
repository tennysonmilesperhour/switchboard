import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  adminClient,
  createAccount,
  DB,
  expectToast,
  login,
  runCascadeSweep,
  unique,
  type Account,
} from './support';

/**
 * People and places, walked by two or three people at once: households edited
 * after they are made, a standing ritual reminding both people on its due day,
 * a private zone's decision reaching the person who asked, shared moments that
 * find each other by distance and without a reload, your people (search,
 * profiles, Ignore), the public profile link, unmatching, and the organizer
 * tools for zones and boards (completion plan P8 to P11, G34 to G39).
 *
 * Every journey makes its own throwaway accounts with the service role, which
 * also arranges what a person cannot do from a browser in a test: connecting
 * two accounts, moving a due date, pinning a home area. The step under test is
 * always a click.
 */

const SHOTS = process.env.E2E_SHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** A fresh, onboarded account with a name a person would recognise. */
async function person(first: string): Promise<Account> {
  const handle = unique(first.toLowerCase().slice(0, 5));
  return createAccount({ handle, name: `${first} ${handle.slice(-4)}` });
}

/** Two accounts that have already accepted each other. */
async function connect(a: Account, b: Account) {
  const { error } = await adminClient()
    .from('connections')
    .insert({ requester_id: a.id, addressee_id: b.id, status: 'accepted' });
  expect(error, error?.message).toBeNull();
}

/** A signed-in browser of its own for `account`. */
async function signedIn(
  browser: Browser,
  account: Account,
  options: Parameters<Browser['newContext']>[0] = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await login(page, account.handle);
  return { context, page };
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

/** The reader's inbox, by notification title. */
async function expectNotification(page: Page, title: string | RegExp) {
  await page.goto('/notifications');
  await expect(page.getByText(title).first()).toBeVisible();
}

function firstName(account: Account): string {
  return account.name.split(' ')[0];
}

test.describe('people and places', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'authenticated journeys run against the desktop app shell');

  test('a household is edited after it is made, and its chip invites the whole set', async ({
    page,
  }) => {
    const owner = await person('Hana');
    const kid = await person('Kofi');
    const partner = await person('Pia');
    const roommate = await person('Remy');
    for (const other of [kid, partner, roommate]) await connect(owner, other);
    const household = unique('The Hanas ');

    await login(page, owner.handle);
    await page.goto('/people');
    // D9: the copy says what the chip does, and what one name does.
    await expect(
      page.getByText('When you invite people, tapping a household selects everyone in it.', {
        exact: false,
      }),
    ).toBeVisible();

    await page.getByLabel('Household name').fill(household);
    const create = page.locator('section', { has: page.getByLabel('Household name') });
    await create.getByRole('button', { name: firstName(kid), exact: true }).click();
    await create.getByRole('button', { name: firstName(roommate), exact: true }).click();
    await create.getByRole('button', { name: 'Create household' }).click();

    const row = page.locator('div.rounded-card', { hasText: household }).first();
    await expect(row).toContainText(`${firstName(kid)}, ${firstName(roommate)}`);
    await shot(page, 'household-created');

    // P9: add Pia, take Remy out, after the fact.
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(row.getByText(`Who’s in ${household}`)).toBeVisible();
    await row.getByRole('button', { name: firstName(partner), exact: true }).click();
    await row.getByRole('button', { name: firstName(roommate), exact: true }).click();
    await shot(page, 'household-editing');
    await row.getByRole('button', { name: 'Save' }).click();
    await expectToast(page, `${household} updated.`);
    await expect(row).toContainText(`${firstName(kid)}, ${firstName(partner)}`);
    await expect(row).not.toContainText(firstName(roommate));

    // It is saved, not just drawn.
    await page.reload();
    await expect(page.locator('div.rounded-card', { hasText: household }).first()).toContainText(
      `${firstName(kid)}, ${firstName(partner)}`,
    );

    // Taking everyone out is refused with the way out named.
    const again = page.locator('div.rounded-card', { hasText: household }).first();
    await again.getByRole('button', { name: 'Edit' }).click();
    await again.getByRole('button', { name: firstName(kid), exact: true }).click();
    await again.getByRole('button', { name: firstName(partner), exact: true }).click();
    await expect(again.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(again.getByText('A household needs at least one person.', { exact: false })).toBeVisible();
    await again.getByRole('button', { name: 'Cancel' }).click();

    // In the wizard the household chip picks exactly its current members.
    await page.goto('/events/new');
    await page.getByPlaceholder('Coffee downtown, Game night, Saturday hike…').fill(unique('Dinner '));
    await page.getByLabel('Details', { exact: true }).fill('At ours.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const chip = page.getByRole('button', { name: new RegExp(`${household} \\(2\\)`) });
    await expect(chip).toBeVisible();
    await chip.click();
    await shot(page, 'household-wizard-chip');
    await expect(page.getByText('2 selected', { exact: false })).toBeVisible();
    const friendsToggle = page.getByRole('button', { name: /Friends · 3/ });
    if ((await friendsToggle.getAttribute('aria-expanded')) !== 'true') await friendsToggle.click();
    await expect(page.getByRole('button', { name: new RegExp(kid.name) })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: new RegExp(partner.name) })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: new RegExp(roommate.name) })).toHaveAttribute('aria-pressed', 'false');

    // And Remove deletes the household, not the friendships.
    await page.goto('/people');
    await page
      .locator('div.rounded-card', { hasText: household })
      .first()
      .getByRole('button', { name: 'Remove' })
      .click();
    await confirmDialog(page, `Delete ${household}?`, 'Delete');
    await expect(page.getByText(household)).toHaveCount(0);
    await expect(page.getByText('Friends · 3')).toBeVisible();
  });

  test('a standing ritual reminds both people on its due day, and either can skip it', async ({
    page,
    browser,
    request,
  }) => {
    const ana = await person('Ana');
    const ben = await person('Ben');
    await connect(ana, ben);

    await login(page, ana.handle);
    await page.goto('/mutual');
    await page.getByLabel('Ritual partner').selectOption({ label: ben.name });
    await page.getByLabel('Ritual cadence').selectOption('7');
    await page.getByRole('button', { name: 'Propose the ritual' }).click();
    await expectToast(page, 'Ritual proposed.');
    const anaRow = page.locator('li', { hasText: ben.name });
    await expect(anaRow).toContainText('waiting on them');

    const { context, page: benPage } = await signedIn(browser, ben);
    try {
      await expectNotification(benPage, 'A standing ritual, proposed');
      await benPage.goto('/mutual');
      const benRow = benPage.locator('li', { hasText: ana.name });
      await expect(benRow).toContainText('waiting on you');
      await benRow.getByRole('button', { name: 'Love it' }).click();
      await expect(benRow).not.toContainText('waiting on you');
      await expectNotification(page, 'It’s a ritual');

      // A week goes by: the next one falls due. Only the date is arranged; the
      // reminder is the real minute sweep.
      const { data: ritual, error } = await adminClient()
        .from('rituals')
        .select('id')
        .eq('creator_id', ana.id)
        .eq('partner_id', ben.id)
        .single();
      expect(error, error?.message).toBeNull();
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const { error: moveError } = await adminClient()
        .from('rituals')
        .update({ due_on: yesterday })
        .eq('id', ritual!.id);
      expect(moveError, moveError?.message).toBeNull();
      await runCascadeSweep(request);

      // D8: both people hear about it, each naming the other.
      await expectNotification(page, 'A ritual is due');
      await expect(page.getByText(`with ${ben.name}. Plan it, or skip this one.`, { exact: false })).toBeVisible();
      await expectNotification(benPage, 'A ritual is due');
      await expect(benPage.getByText(`with ${ana.name}. Plan it, or skip this one.`, { exact: false })).toBeVisible();
      await shot(benPage, 'ritual-reminder-inbox');

      // A second sweep does not remind them again.
      await runCascadeSweep(request);
      await benPage.reload();
      await expect(benPage.getByText('A ritual is due')).toHaveCount(1);

      // Ben skips this one from Mutual; it moves a week on for both of them.
      await benPage.goto('/mutual');
      const due = benPage.locator('li', { hasText: ana.name });
      await expect(due).toContainText('due now');
      await expect(due.getByRole('link', { name: 'Plan it' })).toBeVisible();
      await shot(benPage, 'ritual-due');
      await due.getByRole('button', { name: 'Skip' }).click();
      await expectToast(benPage, 'Skipped. The next one is due in about 7 days.');
      await expect(due).not.toContainText('due now');
      await expect(due.getByRole('button', { name: 'Skip' })).toHaveCount(0);

      await page.goto('/mutual');
      await expect(anaRow).toContainText(/due [A-Z][a-z]{2} \d+/);
      await expect(anaRow.getByRole('button', { name: 'Skip' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a mutual match can be undone by either person, quietly', async ({ page, browser }) => {
    const cy = await person('Cy');
    const dee = await person('Dee');
    await connect(cy, dee);

    async function pick(p: Page, other: Account) {
      await p.goto('/mutual');
      await p.getByRole('button', { name: /Coffee/ }).first().click();
      await p.getByRole('button', { name: new RegExp(other.name) }).click();
      await p.getByRole('button', { name: /Down to Connect/ }).click();
    }

    await login(page, cy.handle);
    await pick(page, dee);
    await expect(page.getByText('Waiting quietly')).toBeVisible();

    const { context, page: deePage } = await signedIn(browser, dee);
    try {
      await pick(deePage, cy);
      await expect(deePage.getByText('It’s mutual!', { exact: true })).toBeVisible();
      const deeMatch = deePage.locator('div', { hasText: cy.name }).filter({
        has: deePage.getByRole('button', { name: 'Unmatch' }),
      }).last();
      await expect(deeMatch).toBeVisible();
      const roomHref = await deeMatch.getByRole('link').first().getAttribute('href');

      await page.goto('/mutual');
      const cyMatch = page.locator('div', { hasText: dee.name }).filter({
        has: page.getByRole('button', { name: 'Unmatch' }),
      }).last();
      await shot(page, 'mutual-match');
      await cyMatch.getByRole('button', { name: 'Unmatch' }).click();
      await confirmDialog(page, `Unmatch with ${dee.name}?`, 'Unmatch');
      await expectToast(page, 'Unmatched.');
      await expect(page.getByRole('button', { name: 'Unmatch' })).toHaveCount(0);

      // Gone for the other person too, room and all.
      await deePage.goto('/mutual');
      await expect(deePage.getByText('Your matches')).toHaveCount(0);
      if (roomHref) {
        await deePage.goto(roomHref);
        await expect(deePage.getByText(cy.name)).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });

  test('Ignore on a connection request sticks: no new request or nudge gets through', async ({
    page,
    browser,
  }) => {
    const eve = await person('Eve');
    const fox = await person('Fox');

    const { context, page: foxPage } = await signedIn(browser, fox);
    try {
      await foxPage.goto('/people');
      await foxPage.getByPlaceholder('@handle, email, or phone').fill(`@${eve.handle}`);
      await foxPage.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(foxPage.getByText('Request sent.')).toBeVisible();

      await login(page, eve.handle);
      await page.goto('/people');
      const asking = page.locator('div', { hasText: fox.name }).filter({
        has: page.getByRole('button', { name: 'Ignore' }),
      }).last();
      await asking.getByRole('button', { name: 'Ignore' }).click();
      await expectToast(page, `You won’t see requests from ${firstName(fox)} for 90 days.`);
      await expect(page.getByRole('button', { name: 'Ignore' })).toHaveCount(0);

      // Eve heard about the first request once.
      const heard = page.getByText(`${fox.name} wants to connect on Switchboard.`);
      await page.goto('/notifications');
      await expect(heard).toHaveCount(1);

      // Fox nudges, then cancels and asks again. Neither reaches Eve.
      await foxPage.goto('/people');
      const waiting = foxPage.locator('li', { hasText: eve.name });
      await waiting.getByRole('button', { name: 'Resend' }).click();
      await expectToast(foxPage, `Nudged ${firstName(eve)} again.`);
      await waiting.getByRole('button', { name: 'Cancel' }).click();
      await expect(waiting).toHaveCount(0);
      await foxPage.getByPlaceholder('@handle, email, or phone').fill(`@${eve.handle}`);
      await foxPage.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(foxPage.getByText('Request sent.')).toBeVisible();

      await page.goto('/people');
      await expect(page.getByText(fox.name)).toHaveCount(0);
      await page.goto('/notifications');
      await expect(heard).toHaveCount(1);
      await expect(page.getByText('Wants to connect', { exact: true })).toHaveCount(0);
      await shot(page, 'ignore-inbox');

      // Eve changing her mind is still one step: asking Fox herself connects them.
      await page.goto('/people');
      await page.getByPlaceholder('@handle, email, or phone').fill(`@${fox.handle}`);
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.getByText('You’re connected. They had already asked you.')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('a private zone tells a passed-on or removed person where they stand, and lets them ask once more', async ({
    page,
    browser,
  }) => {
    const org = await person('Ola');
    const gus = await person('Gus');
    const hal = await person('Hal');
    const name = unique('Retreat ');

    await login(page, org.handle);
    const slug = await createZone(page, name, { description: 'Team days.', visibility: 'private' });

    const gusSide = await signedIn(browser, gus);
    const halSide = await signedIn(browser, hal);
    try {
      const g = gusSide.page;
      await g.goto(`/zones/${slug}`);
      await g.getByLabel('Add a note for the organizer').fill('Gus from design');
      await g.getByRole('button', { name: 'Ask to join' }).click();
      await expectToast(g, 'Asked.');

      const h = halSide.page;
      await h.goto(`/zones/${slug}`);
      await h.getByLabel('Add a note for the organizer').fill('Hal here');
      await h.getByRole('button', { name: 'Ask to join' }).click();
      await expectToast(h, 'Asked.');

      // The organizer passes on Gus and lets Hal in.
      await page.goto(`/zones/${slug}`);
      await page.locator('li', { hasText: 'Gus from design' }).getByRole('button', { name: 'Pass' }).click();
      await expectToast(page, 'Passed on. They’ve been told.');
      await page.locator('li', { hasText: 'Hal here' }).getByRole('button', { name: 'Let in' }).click();
      await expectToast(page, 'They’re in.');

      // D10: Gus is told, and the door says what is true, with the date.
      await expectNotification(g, `${name} didn’t open up this time`);
      await g.goto(`/zones/${slug}`);
      await expect(g.getByText('The organizer passed on your request.', { exact: false })).toBeVisible();
      await expect(g.getByText('You can ask once more from', { exact: false })).toBeVisible();
      await expect(g.getByRole('button', { name: /Ask/ })).toHaveCount(0);
      await shot(g, 'zone-denied-wait');

      // A month goes by (arranged); Gus may ask once more, and it reaches the organizer.
      const { data: zone } = await adminClient().from('zones').select('id').eq('slug', slug).single();
      const { error } = await adminClient()
        .from('zone_join_requests')
        .update({ decided_at: new Date(Date.now() - 31 * 86_400_000).toISOString() })
        .eq('zone_id', zone!.id)
        .eq('requester_id', gus.id);
      expect(error, error?.message).toBeNull();
      await g.reload();
      await expect(g.getByText('It’s been 30 days, so you can ask once more.', { exact: false })).toBeVisible();
      await g.getByLabel('Add a note for the organizer').fill('Gus, second try');
      await g.getByRole('button', { name: 'Ask once more' }).click();
      await expectToast(g, 'Asked.');
      await expect(g.getByText('You’ve asked to join.', { exact: false })).toBeVisible();

      await page.goto(`/zones/${slug}`);
      await page.locator('li', { hasText: 'Gus, second try' }).getByRole('button', { name: 'Pass' }).click();
      await expectToast(page, 'Passed on.');
      await g.reload();
      await expect(g.getByText('You’ve already asked again once', { exact: false })).toBeVisible();
      await expect(g.getByRole('button', { name: /Ask/ })).toHaveCount(0);

      // Hal is removed, and sees that rather than a fresh "Ask to join".
      await h.goto(`/zones/${slug}`);
      await expect(h.getByRole('heading', { name: name, level: 1 })).toBeVisible();
      await page.goto(`/zones/${slug}`);
      await page.locator('li', { hasText: hal.name }).getByRole('button', { name: 'Remove' }).click();
      await confirmDialog(page, `Remove ${hal.name}?`, 'Remove');
      await expectToast(page, `${hal.name} removed.`);
      await h.reload();
      await expect(h.getByRole('heading', { name: `${name} is private` })).toBeVisible();
      await expect(h.getByText('You were removed from this zone', { exact: false })).toBeVisible();
      await expect(h.getByText('You can ask once more from', { exact: false })).toBeVisible();
      await shot(h, 'zone-removed');
    } finally {
      await gusSide.context.close();
      await halSide.context.close();
    }
  });

  test('a zone organizer renames it, moves its end, hands over a moderator, and deletes it; neighbours find it near them', async ({
    page,
    browser,
  }) => {
    const org = await person('Ivy');
    const jo = await person('Jo');
    const name = unique('Spring Fair ');
    const renamed = unique('Summer Fair ');

    // Jo's home area is a few km from the fair (arranged: the place picker
    // geocodes against a service the test environment cannot reach).
    const { error: homeError } = await adminClient()
      .from('profiles')
      .update({ home_latitude: 45.523, home_longitude: -122.676 })
      .eq('id', jo.id);
    expect(homeError, homeError?.message).toBeNull();

    await login(page, org.handle);
    const slug = await createZone(page, name, { description: 'Stalls.', visibility: 'public' });
    const { data: zone } = await adminClient().from('zones').select('id').eq('slug', slug).single();
    const { error: pinError } = await adminClient()
      .from('zones')
      .update({ latitude: 45.512, longitude: -122.658 })
      .eq('id', zone!.id);
    expect(pinError, pinError?.message).toBeNull();

    const joSide = await signedIn(browser, jo);
    try {
      const j = joSide.page;
      await j.goto('/zones');
      const near = j.locator('section', { has: j.getByRole('heading', { name: 'Near you' }) });
      await expect(near).toContainText('Within 50 km of your home area');
      await expect(near.getByRole('link', { name: new RegExp(name) })).toContainText(/km|m\b/);
      await shot(j, 'zones-near-me');

      // Only a roster member can be made a moderator, and public zones have no
      // roster, so the organizer closes it and lets Jo in when she asks.
      await page.goto(`/zones/${slug}`);
      await page.getByRole('button', { name: 'Make private' }).click();
      await expectToast(page, 'Private.');
      await j.goto(`/zones/${slug}`);
      await j.getByRole('button', { name: 'Ask to join' }).click();
      await expectToast(j, 'Asked.');
      await page.reload();
      await page.locator('li', { hasText: jo.name }).getByRole('button', { name: 'Let in' }).click();
      await expectToast(page, 'They’re in.');

      // Rename and move the end date.
      await page.reload();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByLabel('Name', { exact: true }).fill(renamed);
      const end = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
      await page.getByLabel('Ends on').fill(end);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expectToast(page, 'Zone updated.');
      await expect(page.getByRole('heading', { name: renamed, level: 1 })).toBeVisible();
      const shown = new Date(`${end}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
      await expect(page.getByText(new RegExp(`Open until .*${shown}`))).toBeVisible();

      // Promote Jo; Jo now sees the organizer tools, but not Delete.
      await page.locator('li', { hasText: jo.name }).getByRole('button', { name: 'Make moderator' }).click();
      await expectToast(page, `${jo.name} can now manage this zone with you.`);
      await expect(page.locator('li', { hasText: jo.name })).toContainText('moderator');
      await j.reload();
      await expect(j.getByRole('heading', { name: renamed, level: 1 })).toBeVisible();
      await expect(j.getByText('Who can be here')).toBeVisible();
      await j.getByRole('button', { name: 'Edit', exact: true }).click();
      await expect(j.getByRole('button', { name: 'Delete this zone' })).toHaveCount(0);
      await shot(j, 'zone-moderator-view');

      // The organizer deletes it; the address stops opening for both.
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByRole('button', { name: 'Delete this zone' }).click();
      await confirmDialog(page, `Delete ${renamed}?`, 'Delete zone');
      await expectToast(page, 'Zone deleted.');
      await page.waitForURL(/\/zones$/);
      await j.goto(`/zones/${slug}`);
      await expect(j.getByRole('heading', { name: renamed, level: 1 })).toHaveCount(0);
      await expect(j.getByRole('heading', { name: `${renamed} is private` })).toHaveCount(0);
    } finally {
      await joSide.context.close();
    }
  });

  // /zones/join/<code> once crashed with SB-APP-CRASH: joinZoneViaCode called
  // revalidatePath('/zones') while the page was rendering, which Next refuses.
  test('opening a private zone\'s invite link lands on the zone', async ({ page, browser }) => {
    const org = await person('Kai');
    const lu = await person('Lu');
    const name = unique('Offsite ');
    await login(page, org.handle);
    const slug = await createZone(page, name, { description: 'Invite only.', visibility: 'private' });
    await page.getByRole('button', { name: 'Get the link' }).click();
    const link = page.locator('a', { hasText: '/zones/join/' });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href'))!;

    const luSide = await signedIn(browser, lu);
    try {
      await luSide.page.goto(href);
      await luSide.page.waitForURL(new RegExp(`/zones/${slug}$`));
      await expect(luSide.page.getByRole('heading', { name: name, level: 1 })).toBeVisible();
    } finally {
      await luSide.context.close();
    }
  });

  test('a board: a helper is reachable, a co-moderator takes over, the founder leaves, and the board is renamed and deleted', async ({
    page,
    browser,
  }) => {
    const mo = await person('Mo');
    const nia = await person('Nia');
    const name = unique('Elm Street ');
    const renamed = unique('Elm Block ');
    const ask = unique('Need a ladder ');

    await login(page, mo.handle);
    await page.goto('/boards');
    await page.getByLabel('Board name').fill(name);
    await page.getByLabel('Board description').fill('Our block.');
    await page.getByRole('button', { name: 'Create board' }).click();
    await page.waitForURL(/\/boards\/[^/?]+$/, { timeout: 15_000 });
    const boardUrl = page.url();

    await page.getByRole('button', { name: 'Request', exact: true }).click();
    await page.getByLabel('Title').fill(ask);
    await page.getByRole('button', { name: 'Post to the board' }).click();
    await expectToast(page, 'Posted to the board.');
    await page.getByLabel('Invite by handle').fill(nia.handle);
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    await expectToast(page, `Added @${nia.handle}.`);

    const niaSide = await signedIn(browser, nia);
    try {
      const n = niaSide.page;
      await n.goto(boardUrl);
      const post = n.locator('li', { hasText: ask });
      await post.getByRole('button', { name: 'I can help' }).click();
      await expectToast(n, 'The neighbor was notified.');

      // "Can help: Nia" reaches Nia: her name opens her profile.
      await page.reload();
      const mine = page.locator('li', { hasText: ask });
      await expect(mine).toContainText(`Can help: ${nia.name}`);
      // Post actions are thumb-sized (44 px).
      for (const label of ['Mark complete', 'edit', 'remove', 'make it a plan']) {
        // boundingBox() does not wait: a button still rendering measures 0.
        const button = mine.getByRole('button', { name: label, exact: true });
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box?.height ?? 0, `"${label}" is ${box?.height}px tall`).toBeGreaterThanOrEqual(44);
      }
      await shot(page, 'board-can-help');
      await mine.getByRole('link', { name: nia.name }).click();
      await page.waitForURL(new RegExp(`/u/${nia.handle}`));
      await expect(page.getByText(`@${nia.handle}`).first()).toBeVisible();

      // The founder is the only moderator, so leaving waits for a successor.
      await page.goto(boardUrl);
      await expect(page.getByText('You’re the only moderator', { exact: false })).toBeVisible();
      await page.locator('li', { hasText: nia.name }).getByRole('button', { name: 'make moderator' }).click();
      await expectToast(page, `${nia.name} can now help run the board.`);

      await page.getByRole('button', { name: 'Rename or describe the board' }).click();
      await page.locator('section', { has: page.getByRole('heading', { name: 'This board' }) })
        .getByLabel('Board name')
        .fill(renamed);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expectToast(page, 'Board updated.');
      await expect(page.getByRole('heading', { name: renamed, level: 1 })).toBeVisible();

      await page.getByRole('button', { name: 'Leave this board' }).click();
      await confirmDialog(page, `Leave ${renamed}?`, 'Leave board');
      await expectToast(page, `You left ${renamed}.`);
      await page.waitForURL(/\/boards$/);

      // Nia runs it now, and can delete it.
      await n.reload();
      await expect(n.getByRole('heading', { name: renamed, level: 1 })).toBeVisible();
      await expect(n.getByText('Invite-only - you moderate this board')).toBeVisible();
      await shot(n, 'board-new-moderator');
      await n.getByRole('button', { name: 'Delete this board' }).click();
      await confirmDialog(n, `Delete ${renamed}?`, 'Delete board');
      await expectToast(n, 'Board deleted.');
      await n.waitForURL(/\/boards$/);
      await expect(n.getByRole('link', { name: new RegExp(renamed) })).toHaveCount(0);
    } finally {
      await niaSide.context.close();
    }
  });

  // /boards/join/<code> once crashed the same way, from joinBoardViaCode.
  test('opening a board invite link lands on the board', async ({ page, browser }) => {
    const owner = await person('Oz');
    const pat = await person('Pat');
    const name = unique('Oak Lane ');
    await login(page, owner.handle);
    await page.goto('/boards');
    await page.getByLabel('Board name').fill(name);
    await page.getByRole('button', { name: 'Create board' }).click();
    await page.waitForURL(/\/boards\/[^/?]+$/, { timeout: 15_000 });
    const boardUrl = page.url();
    await page.getByRole('button', { name: /Create a shareable invite link/ }).click();
    const link = page.locator('a', { hasText: '/boards/join/' });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href'))!;

    const patSide = await signedIn(browser, pat);
    try {
      await patSide.page.goto(href);
      await patSide.page.waitForURL(boardUrl);
      await expect(patSide.page.getByRole('heading', { name: name, level: 1 })).toBeVisible();
    } finally {
      await patSide.context.close();
    }
  });

  test('shared moments find each other by distance, not spelling, and update without a reload', async ({
    browser,
  }) => {
    // Three people sign in, and a new check-in nearby is only picked up by the
    // page's own 30-second look-again.
    test.setTimeout(180_000);
    const qi = await person('Qi');
    const rae = await person('Rae');
    const sol = await person('Sol');
    // Qi and Rae stand about 70 m apart; Sol is 2 km away but typed the same
    // place name as Qi (D11: located moments match on distance alone).
    // A spot of this run's own, so no other run's check-ins are nearby.
    const lat = Number((40 + Math.random() * 8).toFixed(3));
    const lng = Number((-120 + Math.random() * 20).toFixed(3));
    const here = { latitude: lat, longitude: lng };
    const besideHere = { latitude: lat + 0.0005, longitude: lng - 0.0006 };
    const farAway = { latitude: lat + 0.018, longitude: lng };
    const located = (geolocation: { latitude: number; longitude: number }) => ({
      geolocation,
      permissions: ['geolocation'],
    });

    async function checkIn(p: Page, place: string, experience: RegExp) {
      await p.goto('/moments');
      await p.getByLabel('Where are you?').fill(place);
      await p.getByRole('button', { name: /Use my current location/ }).click();
      await expect(p.getByRole('button', { name: /Use my current location|Pinned to the map/ }).first()).toHaveAttribute('aria-pressed', 'true');
      await p.getByRole('button', { name: experience }).click();
      await p.getByRole('button', { name: 'Check in', exact: true }).click();
      await expect(p.getByText('Checked in', { exact: true })).toBeVisible();
    }

    const qiSide = await signedIn(browser, qi, located(here));
    const raeSide = await signedIn(browser, rae, located(besideHere));
    const solSide = await signedIn(browser, sol, located(farAway));
    try {
      const q = qiSide.page;
      const r = raeSide.page;
      await checkIn(q, unique('Lobby '), /Coffee Conversation/);
      await expect(q.getByText('Nobody else has checked in nearby yet.', { exact: false })).toBeVisible();
      // Marks this document, so a reload would be noticed.
      await q.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));

      // Sol typed the very same words, but is 2 km off: no match.
      await checkIn(solSide.page, (await q.getByText(/^Lobby /).first().innerText()).trim(), /Coffee Conversation/);
      await expect(solSide.page.getByText('Nobody else has checked in nearby yet.', { exact: false })).toBeVisible();

      // Rae, 70 m away, typed something else entirely.
      await checkIn(r, unique('Café Luna '), /Coffee Conversation/);
      await expect(r.getByText('Someone here is open to:')).toHaveCount(1);

      // Qi's open page finds Rae on its own (and not Sol).
      await expect(q.getByText('Someone here is open to:')).toHaveCount(1, { timeout: 45_000 });
      expect(
        await q.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument),
        'Qi’s page found Rae without being reloaded',
      ).toBe(true);
      await shot(q, 'moments-found');

      // Curiosity both ways introduces them.
      await q.getByRole('button', { name: 'I’d like to learn more' }).click();
      await expect(q.getByText('You’re curious - they haven’t decided yet.', { exact: false })).toBeVisible();
      await r.reload();
      await r.getByRole('button', { name: 'I’d like to learn more' }).click();
      await expect(r.getByText('Mutual curiosity', { exact: true })).toBeVisible();
      await q.reload();
      await expect(q.getByText('Mutual curiosity', { exact: true })).toBeVisible();
      await expect(q.getByText(rae.name)).toBeVisible();
      await shot(q, 'moments-mutual');
    } finally {
      for (const side of [qiSide, raeSide, solSide]) {
        await side.page.goto('/moments', { timeout: 10_000 }).catch(() => {});
        await side.page
          .getByRole('button', { name: 'Check out', exact: true })
          .click({ timeout: 5_000 })
          .catch(() => {});
        await side.context.close();
      }
    }
  });

  test('two people near each other in discovery match on one tap each, whatever order they listed their contexts', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    // Each card used to default to the other person's first context, so Ula
    // saved Vic's first and Vic saved Ula's: both chose each other and never
    // matched. Same two contexts here, listed in opposite orders.
    const ula = await person('Ula');
    const vic = await person('Vic');
    const wes = await person('Wes');
    const contexts = [unique('Board games '), unique('Bouldering ')];
    // Discovery is shared by every run and lists shared interests first, so
    // these three share one nobody else has. A home spot of this run's own.
    const interest = unique('origami');
    const lat = Number((40 + Math.random() * 8).toFixed(3));
    const lng = Number((-120 + Math.random() * 20).toFixed(3));
    const profile = (discovery_contexts: string[], home_latitude: number) => ({
      discoverable: true,
      discovery_geography: true,
      discovery_interests: true,
      interests: [interest],
      discovery_contexts,
      home_latitude,
      home_longitude: lng,
    });
    const admin = adminClient();
    for (const [account, update] of [
      [ula, profile(contexts, lat)],
      // ~10 km north: near.
      [vic, profile([...contexts].reverse(), lat + 0.09)],
      // ~200 km north: discoverable, but not near.
      [wes, profile(contexts, lat + 1.8)],
    ] as const) {
      const { error } = await admin.from('profiles').update(update).eq('id', account.id);
      expect(error, error?.message).toBeNull();
    }

    const cardFor = (p: Page, other: Account) =>
      p
        .locator('div', { has: p.getByRole('link', { name: other.name, exact: true }) })
        .filter({ has: p.getByRole('button', { name: 'Interested' }) })
        .last();

    const ulaSide = await signedIn(browser, ula);
    const vicSide = await signedIn(browser, vic);
    try {
      const u = ulaSide.page;
      await u.goto('/discover');
      await u.getByRole('button', { name: 'Nearby', exact: true }).click();
      await expect(cardFor(u, vic)).toBeVisible();
      await expect(u.getByRole('link', { name: wes.name, exact: true })).toHaveCount(0);
      await cardFor(u, vic).getByRole('button', { name: 'Interested' }).click();
      await expectToast(u, 'Saved privately. Nothing is sent unless it’s mutual.');

      const v = vicSide.page;
      await v.goto('/discover');
      await v.getByRole('button', { name: 'Nearby', exact: true }).click();
      await cardFor(v, ula).getByRole('button', { name: 'Interested' }).click();
      await expectToast(v, 'It is mutual.');
      await shot(v, 'discovery-nearby-match');

      const { data: match } = await admin
        .from('matches')
        .select('activity')
        .eq('kind', 'discover_connect')
        .or(`user_a.eq.${ula.id},user_b.eq.${ula.id}`)
        .single();
      expect(match?.activity).toBe([...contexts].sort()[0]);
    } finally {
      await ulaSide.context.close();
      await vicSide.context.close();
    }
  });

  // What real phones do to a location fix, simulated: a still phone wobbling
  // across a cell edge, an approximate fix (iOS with Precise Location off), and
  // a permission prompt nobody answers. Each was a real failure before.
  test('a still phone wobbling on a cell edge sends a couple of updates, not one a second', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ana = await person('Ana');
    const lat = Number((40 + Math.random() * 8).toFixed(3));
    const lng = Number((-120 + Math.random() * 20).toFixed(3));
    // lat + 0.0005 is the rounding edge between two ~110 m cells; ±2 m either side.
    const side = (s: 1 | -1) => ({ latitude: lat + 0.0005 + s * 0.00002, longitude: lng, accuracy: 12 });
    const { context, page } = await signedIn(browser, ana, {
      geolocation: side(-1),
      permissions: ['geolocation'],
    });
    // refreshLocationPoint's arguments are (lat, lng, accuracy).
    const writes: string[] = [];
    page.on('request', (request) => {
      const body = request.postData() ?? '';
      if (request.method() === 'POST' && request.headers()['next-action'] && /^\[-?\d+\.\d+,-?\d+\.\d+/.test(body)) {
        writes.push(body);
      }
    });
    try {
      await page.goto('/map');
      await page.getByRole('button', { name: /Share my location/ }).click();
      await expect(page.getByText('You’re live on the map')).toBeVisible({ timeout: 20_000 });
      for (let i = 0; i < 25; i += 1) {
        await context.setGeolocation(side(i % 2 === 0 ? 1 : -1));
        await page.waitForTimeout(1000);
      }
      // One a second used to go out (the hourly budget gone in five minutes).
      expect(writes.length, writes.join('\n')).toBeLessThanOrEqual(2);
    } finally {
      await page.getByRole('button', { name: 'Stop' }).click().catch(() => {});
      await context.close();
    }
  });

  test('an approximate fix is not pinned to a check-in, and says why', async ({ browser }) => {
    const rae = await person('Rae');
    const lat = Number((40 + Math.random() * 8).toFixed(3));
    const lng = Number((-120 + Math.random() * 20).toFixed(3));
    // What iOS reports with Precise Location off: a point km away, ±3 km.
    const { context, page } = await signedIn(browser, rae, {
      geolocation: { latitude: lat + 0.027, longitude: lng, accuracy: 3000 },
      permissions: ['geolocation'],
    });
    try {
      await page.goto('/moments');
      await page.getByLabel('Where are you?').fill(unique('Café '));
      await page.getByRole('button', { name: /Use my current location/ }).click();
      await expect(page.getByText(/only gave an approximate location \(within 3\.0 km\)/)).toBeVisible();
      await expect(page.getByRole('button', { name: /Use my current location|Pinned to the map/ }).first()).toHaveAttribute('aria-pressed', 'false');
      await page.getByRole('button', { name: /Coffee Conversation/ }).click();
      await page.getByRole('button', { name: 'Check in', exact: true }).click();
      await expect(page.getByText('Checked in', { exact: true })).toBeVisible();

      const { data } = await adminClient()
        .from('moments')
        .select('latitude, longitude')
        .eq('user_id', rae.id)
        .eq('status', 'open')
        .single();
      expect(data).toEqual({ latitude: null, longitude: null });
    } finally {
      await page.getByRole('button', { name: 'Check out', exact: true }).click().catch(() => {});
      await context.close();
    }
  });

  test('indoors, a GPS lock that never comes falls back to a Wi-Fi fix', async ({ browser }) => {
    const qi = await person('Qi');
    const lat = Number((40 + Math.random() * 8).toFixed(3));
    const lng = Number((-120 + Math.random() * 20).toFixed(3));
    const { context, page } = await signedIn(browser, qi, {
      geolocation: { latitude: lat, longitude: lng, accuracy: 40 },
      permissions: ['geolocation'],
    });
    // A building: every high-accuracy ask times out, a network fix answers.
    await page.addInitScript(() => {
      const geo = navigator.geolocation;
      const ask = geo.getCurrentPosition.bind(geo);
      geo.getCurrentPosition = (ok, fail, options) => {
        if (!options?.enableHighAccuracy) return ask(ok, fail, options);
        setTimeout(() => fail?.({ code: 3, message: 'Timeout expired', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError), 50);
      };
    });
    try {
      await page.goto('/moments');
      await page.getByRole('button', { name: /Use my current location/ }).click();
      await expect(page.getByRole('button', { name: /Use my current location|Pinned to the map/ }).first()).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText(/location fix/)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a location prompt nobody answers stops waiting and says so', async ({ browser }) => {
    test.setTimeout(90_000);
    const ana = await person('Ana');
    // A prompt that sits there: the request never calls back. Simulated, since
    // a headless browser with no permission may refuse at once instead.
    const { context, page } = await signedIn(browser, ana);
    await context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = () => {};
    });
    const moments = await context.newPage();
    try {
      await page.goto('/map');
      await moments.goto('/moments');
      await page.getByRole('button', { name: /Share my location/ }).click();
      await moments.getByRole('button', { name: /Use my current location/ }).click();
      await expect(page.getByRole('button', { name: /Turning on/ })).toBeVisible();

      // The wait is 20 s (LOCATION_PROMPT_WAIT_MS), longer than a toast check.
      await expect(page.getByRole('status', { name: 'Notifications' })).toContainText(
        'Still waiting for location permission.',
        { timeout: 30_000 },
      );
      await expect(page.getByRole('button', { name: /Share my location/ })).toBeEnabled();
      await expect(moments.getByText(/Still waiting for location permission\./)).toBeVisible({ timeout: 25_000 });
      await expect(moments.getByRole('button', { name: /Use my current location/ })).toBeEnabled();
    } finally {
      await context.close();
    }
  });

  // LiveNotifications once joined its realtime channel before the user's token
  // resolved, so owner-only RLS dropped every event: no live banner, no bell
  // update, no refresh of /moments (src/lib/supabase/realtime.ts).
  test('curiosity from someone nearby shows up on an open Moments page without a reload', async ({
    browser,
  }) => {
    const tia = await person('Tia');
    const uma = await person('Uma');
    const lat = Number((40 + Math.random() * 8).toFixed(3));
    const lng = Number((-120 + Math.random() * 20).toFixed(3));
    const tiaSide = await signedIn(browser, tia, {
      geolocation: { latitude: lat, longitude: lng },
      permissions: ['geolocation'],
    });
    const umaSide = await signedIn(browser, uma, {
      geolocation: { latitude: lat + 0.0004, longitude: lng },
      permissions: ['geolocation'],
    });
    try {
      for (const [p, place] of [
        [tiaSide.page, unique('Pier ')],
        [umaSide.page, unique('Boardwalk ')],
      ] as const) {
        await p.goto('/moments');
        await p.getByLabel('Where are you?').fill(place);
        await p.getByRole('button', { name: /Use my current location/ }).click();
        await p.getByRole('button', { name: /Coffee Conversation/ }).click();
        await p.getByRole('button', { name: 'Check in', exact: true }).click();
        await expect(p.getByText('Checked in', { exact: true })).toBeVisible();
      }
      const t = tiaSide.page;
      await t.reload();
      await t.getByRole('button', { name: 'I’d like to learn more' }).click();
      await expect(t.getByText('You’re curious', { exact: false })).toBeVisible();

      const u = umaSide.page;
      await u.reload();
      await u.getByRole('button', { name: 'I’d like to learn more' }).click();
      await expect(u.getByText('Mutual curiosity', { exact: true })).toBeVisible();
      // Well inside the page's own 30-second look-again: only the
      // notification can have refreshed it this fast.
      await expect(t.getByText('Mutual curiosity', { exact: true })).toBeVisible({ timeout: 10_000 });
    } finally {
      for (const side of [tiaSide, umaSide]) {
        await side.page.goto('/moments', { timeout: 10_000 }).catch(() => {});
        await side.page
          .getByRole('button', { name: 'Check out', exact: true })
          .click({ timeout: 5_000 })
          .catch(() => {});
        await side.context.close();
      }
    }
  });

  test('your people: search them, open a profile, and share your own /u/ link', async ({
    browser,
  }) => {
    const vi = await person('Vi');
    const friends = await Promise.all(
      ['Wren', 'Xan', 'Yara', 'Zed', 'Abe', 'Bo'].map((first) => person(first)),
    );
    for (const friend of friends) await connect(vi, friend);
    const yara = friends[2];

    const viSide = await signedIn(browser, vi, {
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const yaraSide = await signedIn(browser, yara);
    try {
      const page = viSide.page;
      await page.goto('/people');
      await expect(page.getByText('Friends · 6')).toBeVisible();
      const search = page.getByPlaceholder('Search your people…');
      await search.fill(yara.handle.slice(0, 7));
      const rows = page.locator('section', { has: page.getByText('Friends · 6') }).getByRole('button', {
        expanded: false,
      });
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(yara.name);
      await search.fill('nobody-by-this-name');
      await expect(page.getByText('Nobody in your people matches “nobody-by-this-name”.')).toBeVisible();

      // A row opens to their profile.
      await search.fill(yara.name);
      await page.getByRole('button', { name: new RegExp(yara.name) }).click();
      await page.getByRole('link', { name: `View ${firstName(yara)}’s profile` }).click();
      await page.waitForURL(new RegExp(`/u/${yara.handle}`));
      await expect(page.getByText(`@${yara.handle}`).first()).toBeVisible();
      await shot(page, 'people-profile');

      // G36: Vi's own profile offers a link to copy, and it opens for someone else.
      // The link is on the contact card itself, not only inside the QR dialog.
      await page.goto('/profile');
      const copy = page.getByRole('button', { name: 'Copy profile link' });
      await expect(copy).toBeVisible();
      const link = (await copy.getAttribute('title'))!;
      expect(new URL(link).pathname).toBe(`/u/${vi.handle}`);
      await copy.click();
      await expect(page.getByRole('button', { name: 'Copied' }).first()).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
      await page.getByRole('button', { name: 'Show QR' }).click();
      await expect(page.getByRole('dialog').getByText(link)).toBeVisible();
      await shot(page, 'profile-share');

      await yaraSide.page.goto(new URL(link).pathname);
      await expect(yaraSide.page.getByText(vi.name).first()).toBeVisible();
      await expect(yaraSide.page.getByText(`@${vi.handle}`).first()).toBeVisible();
    } finally {
      await viSide.context.close();
      await yaraSide.context.close();
    }
  });
  // Find each other: exact location between two people who matched. Two phones
  // about 80 m apart in their match room. The other person's point appears
  // only once both share, it is exact (not the map's 110 m cell), a move
  // reaches the other phone without a reload, and Stop takes it away.
  test('two people who matched share exact locations and see how far and which way', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ana = await person('Ana');
    const bo = await person('Bo');
    const admin = adminClient();
    const { data: room, error } = await admin
      .from('rooms')
      .insert({ kind: 'match', title: `${firstName(ana)} + ${firstName(bo)}`, created_by: ana.id })
      .select('id')
      .single();
    expect(error, error?.message).toBeNull();
    const { error: memberError } = await admin.from('room_members').insert([
      { room_id: room!.id, member_id: ana.id },
      { room_id: room!.id, member_id: bo.id },
    ]);
    expect(memberError, memberError?.message).toBeNull();

    const lat = 39.7392;
    const lng = -104.9903;
    const anaSide = await signedIn(browser, ana, {
      geolocation: { latitude: lat, longitude: lng, accuracy: 5 },
      permissions: ['geolocation'],
    });
    // About 80 m north of Ana.
    const boSide = await signedIn(browser, bo, {
      geolocation: { latitude: lat + 0.00072, longitude: lng, accuracy: 5 },
      permissions: ['geolocation'],
    });
    try {
      const a = anaSide.page;
      const b = boSide.page;
      await a.goto(`/rooms/${room!.id}`);
      await b.goto(`/rooms/${room!.id}`);

      await a.getByRole('button', { name: /Find each other/ }).click();
      await a.getByRole('button', { name: 'Share my exact location' }).click();
      await expect(a.getByText(`Waiting for ${firstName(bo)}`, { exact: false })).toBeVisible();

      // Bo is told in the chat, and sees nothing of Ana until he shares.
      await expect(b.getByText('I’m sharing my exact location for the next hour')).toBeVisible({
        timeout: 20_000,
      });
      await b.getByRole('button', { name: /Find each other/ }).click();
      await expect(b.getByRole('link', { name: /Walk to/ })).toHaveCount(0);
      await b.getByRole('button', { name: 'Share my exact location' }).click();

      await expect(b.getByText(`${ana.name} is about 80 m south of you.`)).toBeVisible({
        timeout: 15_000,
      });
      await expect(a.getByText(`${bo.name} is about 80 m north of you.`)).toBeVisible({
        timeout: 15_000,
      });
      const walk = b.getByRole('link', { name: `Walk to ${ana.name}` });
      await expect(walk).toHaveAttribute('href', /39\.739200,-104\.990300/);
      await shot(b, 'find-each-other');

      // Ana walks ~40 m toward Bo; his phone follows without a reload.
      await anaSide.context.setGeolocation({ latitude: lat + 0.00036, longitude: lng, accuracy: 5 });
      await expect(b.getByText(`${ana.name} is about 40 m south of you.`)).toBeVisible({
        timeout: 20_000,
      });

      await a.getByRole('button', { name: 'Stop sharing' }).click();
      await expectToast(a, 'Stopped sharing your exact location.');
      await expect(b.getByText(`Waiting for ${firstName(ana)}`, { exact: false })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await anaSide.context.close();
      await boSide.context.close();
    }
  });
});
