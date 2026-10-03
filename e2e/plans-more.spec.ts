import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  adminClient,
  createAccount,
  DB,
  linkIn,
  login,
  pageComplaints,
  requireMailRelay,
  runCascadeSweep,
  unique,
  waitForMail,
  type Account,
} from './support';

/**
 * The plan features that only show up once a plan is under way: a yes held
 * for a guardian, the invite list a host can open to guests, a date poll that
 * gives the plan its date, Open Table requests, a live window extended and a
 * no turned into a yes, the edit form's extras, and what comes after the plan
 * (the Memory Capsule and Run it back).
 *
 * Every journey uses throwaway accounts made in `beforeAll` (a host, two of
 * the host's friends, and someone who only knows one of the guests), so the
 * seeded users' sessions are left alone. The service role only arranges what
 * would otherwise take a day to happen (a deadline passing, a plan being in
 * the past) or has its own journey (co-hosting); every step under test is a
 * click, a link or a cron request.
 */

const TITLE_PLACEHOLDER = 'Coffee downtown, Game night, Saturday hike…';
type StepLabel = 'Basics' | 'People' | 'Invites' | 'Order' | 'Privacy' | 'Review';

async function currentStep(page: Page): Promise<StepLabel> {
  const current = page.getByRole('list', { name: 'Steps' }).locator('[aria-current="step"]');
  const label = (await current.getAttribute('aria-label')) ?? '';
  const match = label.match(/^Step \d+, (.+)$/);
  if (!match) throw new Error(`Could not read the wizard step from "${label}"`);
  return match[1] as StepLabel;
}

async function createPlan(
  page: Page,
  title: string,
  prepare: Partial<Record<StepLabel, (page: Page) => Promise<void>>>,
): Promise<string> {
  await page.goto('/events/new');
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title);
  await page.getByLabel('Details', { exact: true }).fill('Seeded by the plans-more e2e suite.');
  for (let guard = 0; guard < 8; guard += 1) {
    const step = await currentStep(page);
    if (step === 'Review') break;
    await prepare[step]?.(page);
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await expect(
      next,
      `The wizard would not leave ${step}. On screen: ${(await pageComplaints(page)) || 'nothing'}`,
    ).toBeEnabled({ timeout: 5_000 });
    await next.click();
    await expect.poll(() => currentStep(page)).not.toBe(step);
  }
  await prepare.Review?.(page);
  await page.getByRole('button', { name: /Send invitations|Create & start deciding/ }).click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 45_000 });
  return page.url();
}

async function pickFriend(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name) }).click();
}

/** A `datetime-local` value `days` from now, at 6pm local. */
function localDateTime(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T18:00`;
}

async function eventRow(eventId: string) {
  const { data, error } = await adminClient()
    .from('events')
    .select('status, starts_at, time_zone, open_table, theme, reminders_enabled, show_invite_list, cover_url')
    .eq('id', eventId)
    .single();
  if (error) throw error;
  return data;
}

function eventIdOf(url: string): string {
  return url.match(/\/events\/([0-9a-f-]{36})/)![1];
}

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

async function connect(a: Account, b: Account) {
  const { error } = await adminClient()
    .from('connections')
    .upsert(
      { requester_id: a.id, addressee_id: b.id, status: 'accepted' },
      { onConflict: 'requester_id,addressee_id' },
    );
  if (error) throw error;
}

async function inviteOf(eventId: string, inviteeId: string) {
  const { data, error } = await adminClient()
    .from('invites')
    .select('id, status, window_minutes')
    .eq('event_id', eventId)
    .eq('invitee_id', inviteeId)
    .single();
  if (error) throw error;
  return data;
}

let host: Account;
let guest: Account;
let friend: Account;
let stranger: Account;

test.describe('plans, more', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'host journeys run against the desktop app shell');

  test.beforeAll(async () => {
    const tag = unique('');
    host = await createAccount({ handle: `pmhost${tag}`, name: `Hana Host ${tag}` });
    guest = await createAccount({ handle: `pmguest${tag}`, name: `Gus Guest ${tag}` });
    friend = await createAccount({ handle: `pmfriend${tag}`, name: `Fern Friend ${tag}` });
    await connect(host, guest);
    stranger = await createAccount({ handle: `pmasker${tag}`, name: `Ada Asker ${tag}` });
    await connect(host, friend);
    // Knows the guest, not the host: the friend-of-a-guest Open Table is for.
    await connect(guest, stranger);
  });

  test('a yes that needs a guardian takes no seat until the guardian approves', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    requireMailRelay();
    const title = unique('Guardian plan ');
    const guardianEmail = `${unique('parent')}@example.com`;

    // One seat, two friends invited at once, every yes needing a guardian.
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await login(hostPage, host.handle);
    const eventUrl = await createPlan(hostPage, title, {
      Basics: async (page) => {
        await page.locator('#capacity').fill('1');
      },
      People: async (page) => {
        await pickFriend(page, guest.name);
        await pickFriend(page, friend.name);
      },
      Privacy: async (page) => {
        await page.getByLabel(/Require parental approval/).check();
      },
    });
    const eventId = eventIdOf(eventUrl);

    // The guest says yes: it is held, and they are asked for a guardian.
    await asPerson(browser, guest.handle, async (page) => {
      await page.goto(eventUrl);
      await page.getByRole('button', { name: 'I’m in ✓' }).click();
      await expect(page.getByText('One more step - a guardian needs to approve')).toBeVisible();
      expect((await inviteOf(eventId, guest.id)).status).toBe('pending_approval');
      await page.getByLabel('Guardian’s email').fill(guardianEmail);
      await page.getByLabel('Guardian’s name (optional)').fill('Pat');
      await page.getByRole('button', { name: 'Send approval request' }).click();
      await expect(page.getByText(/We emailed/)).toBeVisible();
      // The step survives a reload: it lives on the invite, not in the tab.
      await page.reload();
      await expect(page.getByText('Waiting on a guardian')).toBeVisible();
    });

    // The host sees who is waiting, and where the request went.
    await hostPage.reload();
    const waiting = hostPage.locator('section', {
      has: hostPage.getByRole('heading', { name: 'Waiting on a guardian' }),
    });
    await expect(waiting).toContainText(guest.name);
    await expect(waiting).toContainText(`Emailed ${guardianEmail}`);

    // The second friend says yes too, and asks their own guardian.
    const friendGuardian = `${unique('parent')}@example.com`;
    await asPerson(browser, friend.handle, async (page) => {
      await page.goto(eventUrl);
      await page.getByRole('button', { name: 'I’m in ✓' }).click();
      await page.getByLabel('Guardian’s email').fill(friendGuardian);
      await page.getByRole('button', { name: 'Send approval request' }).click();
      await expect(page.getByText(/We emailed/)).toBeVisible();
    });

    // The guardian reads who, what, when and who's hosting, from the email's link.
    const mail = await waitForMail(guardianEmail, `${guest.name} wants to join ${title}`);
    expect(mail).toContain(`Host: ${host.name}`);
    const link = linkIn(mail, '/approve/');
    const guardianContext = await browser.newContext();
    const guardian = await guardianContext.newPage();
    await guardian.goto(link);
    await expect(guardian.getByText(`Hi Pat. ${guest.name} said yes`)).toBeVisible();
    await expect(guardian.getByText(title)).toBeVisible();
    await expect(guardian.getByText(host.name)).toBeVisible();
    await expect(guardian.getByText('Time TBD')).toBeVisible();

    // The friend's guardian answers first. The guest's held yes, though it came
    // first, held no seat, so the friend takes the only one.
    const friendMail = await waitForMail(friendGuardian, `${friend.name} wants to join ${title}`);
    const friendGuardianContext = await browser.newContext();
    const other = await friendGuardianContext.newPage();
    await other.goto(linkIn(friendMail, '/approve/'));
    await other.getByRole('button', { name: 'Approve' }).click();
    await expect.poll(async () => (await inviteOf(eventId, friend.id)).status).toBe('accepted');
    await friendGuardianContext.close();

    await guardian.getByRole('button', { name: 'Approve' }).click();
    await expect.poll(async () => (await inviteOf(eventId, guest.id)).status).toBe('waitlisted');
    await guardianContext.close();

    await hostPage.reload();
    await expect(
      hostPage.getByRole('heading', { name: 'Waiting on a guardian' }),
    ).toHaveCount(0);
    await hostContext.close();

    // On /plans the guest finds it under the waitlist, not under Going.
    await asPerson(browser, guest.handle, async (page) => {
      await page.goto('/plans');
      const waitlist = page.locator('section', {
        has: page.getByRole('heading', { name: 'On the waitlist' }),
      });
      await expect(waitlist).toContainText(title);
      const going = page.locator('section', { has: page.getByRole('heading', { name: 'Going', exact: true }) });
      await expect(going.getByText(title)).toHaveCount(0);
    });
  });

  test('a date poll tells its voters, and the date it decides is the evening in the plan’s zone', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    requireMailRelay();
    const title = unique('Date poll ');
    const guestEmail = `${unique('polly')}@example.com`;

    // The host plans from Chicago, so "evening" has to mean 6pm there.
    const hostContext = await browser.newContext({ timezoneId: 'America/Chicago' });
    const hostPage = await hostContext.newPage();
    await login(hostPage, host.handle);
    const eventUrl = await createPlan(hostPage, title, {
      People: async (page) => {
        await pickFriend(page, guest.name);
        await page.getByPlaceholder('Name (optional)').fill('Polly Email');
        await page.getByPlaceholder('@username, email, or phone').fill(guestEmail);
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText('2 people selected')).toBeVisible();
      },
      Invites: async (page) => {
        await page.getByText('Let the group decide what to do 🗳️').click();
      },
    });
    const eventId = eventIdOf(eventUrl);

    // Voters hear the poll is open: the friend in the app, the email guest by
    // the share link "to help pick the date".
    const mail = await waitForMail(guestEmail, `Help pick the date: ${title}`);
    expect(linkIn(mail, '/i/')).toMatch(/\/i\/[0-9a-f-]+$/);
    await expect
      .poll(async () => {
        const { data } = await adminClient()
          .from('notifications')
          .select('title, url')
          .eq('user_id', guest.id)
          .eq('url', `/events/${eventId}`);
        return data?.length ?? 0;
      })
      .toBeGreaterThan(0);

    // "Send the invitations" waits while the group is still deciding.
    await hostPage.reload();
    await expect(hostPage.getByRole('button', { name: 'Waiting for the group to decide…' })).toBeDisabled();

    // The host marks tomorrow evening free and puts it on the poll.
    const evening = hostPage.getByRole('button', { name: /Evening: \d+ free/ }).nth(1);
    await evening.click();
    await hostPage.getByRole('button', { name: 'Save when I’m free' }).click();
    await expect(hostPage.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    // The friend, notified, marks the same evening.
    await asPerson(browser, guest.handle, async (page) => {
      await page.goto(eventUrl);
      await page.getByRole('button', { name: /Evening: \d+ free/ }).nth(1).click();
      await page.getByRole('button', { name: 'Save when I’m free' }).click();
      await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    });
    await hostPage.reload();
    await hostPage.getByRole('button', { name: 'Put the best times on the poll' }).click();
    await expect(hostPage.getByText(/Added 1 time to the poll/)).toBeVisible();

    // Closing and choosing it gives the plan its date: 6pm, Chicago time.
    await hostPage.getByRole('button', { name: /^Close voting/ }).click();
    await hostPage.getByRole('button', { name: 'Choose this' }).click();
    const dated = async () => {
      const { data } = await adminClient()
        .from('events')
        .select('starts_at, time_zone')
        .eq('id', eventId)
        .single();
      return data!;
    };
    await expect
      .poll(async () => (await dated()).starts_at, {
        message: 'deciding the poll did not give the plan its date',
      })
      .toBeTruthy();
    const decided = await dated();
    expect(decided.time_zone).toBe('America/Chicago');
    const chicagoHour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(new Date(decided.starts_at!));
    expect(chicagoHour).toBe('18');

    await hostPage.reload();
    await expect(hostPage.getByText('Time TBD')).toHaveCount(0);
    const send = hostPage.getByRole('button', { name: 'Send the invitations 🪜' });
    await expect(send).toBeEnabled();
    await send.click();
    await expect
      .poll(async () => {
        const { data } = await adminClient().from('events').select('status').eq('id', eventId).single();
        return data?.status;
      })
      .toBe('inviting');
    await hostContext.close();
  });

  test('a date poll that closes with nothing suggested lets the host set the date', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const title = unique('Empty poll ');
    await login(page, host.handle);
    const eventUrl = await createPlan(page, title, {
      People: async (wizard) => {
        await pickFriend(wizard, guest.name);
      },
      Invites: async (wizard) => {
        await wizard.getByText('Let the group decide what to do 🗳️').click();
        await wizard.locator('#voteDeadline').fill(localDateTime(2));
      },
    });
    const eventId = eventIdOf(eventUrl);

    // Nobody suggests anything, and the deadline passes.
    const { error } = await adminClient()
      .from('polls')
      .update({ vote_deadline: new Date(Date.now() - 60_000).toISOString() })
      .eq('event_id', eventId);
    expect(error, error?.message).toBeNull();
    await runCascadeSweep(request);

    // Not a dead end: the host is told the plan needs a date, and sets one.
    await page.goto(eventUrl);
    await expect(page.getByText('The group has decided, but the plan has no date yet.')).toBeVisible();
    await page.getByRole('link', { name: 'Set the date 📅' }).click();
    await page.waitForURL(/\/edit(#startsAt)?$/);
    await page.locator('#startsAt').fill(localDateTime(3));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);
    await expect.poll(async () => (await eventRow(eventId)).starts_at).toBeTruthy();

    const send = page.getByRole('button', { name: 'Send the invitations 🪜' });
    await expect(send).toBeEnabled();
    await send.click();
    await expect.poll(async () => (await eventRow(eventId)).status).toBe('inviting');
  });

  test('guests see who else is invited only when the host turns the list on', async ({
    browser,
  }) => {
    const title = unique('Invite list ');
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await login(hostPage, host.handle);
    const eventUrl = await createPlan(hostPage, title, {
      People: async (page) => {
        await pickFriend(page, guest.name);
        await pickFriend(page, friend.name);
      },
    });
    const eventId = eventIdOf(eventUrl);
    expect((await eventRow(eventId)).show_invite_list).toBe(false);

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await login(guestPage, guest.handle);
    await guestPage.goto(eventUrl);
    await expect(guestPage.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(guestPage.getByText('Who’s invited')).toHaveCount(0);
    await expect(guestPage.getByText(friend.name)).toHaveCount(0);

    // The host turns the list on from the plan page.
    await hostPage.reload();
    await hostPage.getByLabel(/Show the whole invite list/).check();
    await expect.poll(async () => (await eventRow(eventId)).show_invite_list).toBe(true);

    await guestPage.reload();
    const list = guestPage.locator('section', { has: guestPage.getByText('Who’s invited') });
    await expect(list).toContainText(friend.name.split(' ')[0]);

    // And off again.
    await hostPage.getByLabel(/Show the whole invite list/).uncheck();
    await expect.poll(async () => (await eventRow(eventId)).show_invite_list).toBe(false);
    await guestPage.reload();
    await expect(guestPage.getByText('Who’s invited')).toHaveCount(0);
    await guestContext.close();
    await hostContext.close();
  });

  test('Open Table: a friend of a guest asks, sees it pending, and hears back either way', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const title = unique('Open table ');
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await login(hostPage, host.handle);
    const eventUrl = await createPlan(hostPage, title, {
      Basics: async (page) => {
        await page.locator('#capacity').fill('4');
      },
      People: async (page) => {
        await pickFriend(page, guest.name);
        await pickFriend(page, friend.name);
      },
      Privacy: async (page) => {
        await expect(page.getByLabel(/Open Table/)).toBeChecked();
      },
    });
    const eventId = eventIdOf(eventUrl);
    // A co-host hears about requests too (arranged: co-hosting has its own journey).
    const { error: cohostError } = await adminClient()
      .from('event_cohosts')
      .insert({ event_id: eventId, cohost_id: friend.id });
    expect(cohostError, cohostError?.message).toBeNull();

    await asPerson(browser, guest.handle, async (page) => {
      await page.goto(eventUrl);
      await page.getByRole('button', { name: 'I’m in ✓' }).click();
      await expect.poll(async () => (await inviteOf(eventId, guest.id)).status).toBe('accepted');
    });

    const notified = async (userId: string, kind: string) => {
      const { data } = await adminClient()
        .from('notifications')
        .select('title')
        .eq('user_id', userId)
        .eq('kind', kind)
        .ilike('body', `%${title}%`);
      return data?.length ?? 0;
    };

    const askerContext = await browser.newContext();
    const asker = await askerContext.newPage();
    await login(asker, stranger.handle);
    const ask = async () => {
      await asker.goto('/discover');
      const card = asker.locator('div', { hasText: title }).filter({
        has: asker.getByRole('button', { name: 'Ask to join' }),
      }).last();
      await card.getByRole('button', { name: 'Ask to join' }).click();
      await expect(asker.getByText('Asked to join. The host will get back to you.')).toBeVisible();
      // The request stays visible to the person who made it.
      await asker.reload();
      const waiting = asker.getByText('Waiting on the host').locator('..');
      await expect(waiting).toContainText(title);
    };
    await ask();
    await asker.goto('/plans');
    const askedSection = asker.locator('section', {
      has: asker.getByRole('heading', { name: 'Asked to join' }),
    });
    await expect(askedSection).toContainText(title);

    // The host and the co-host are told.
    await expect.poll(() => notified(host.id, 'join_request')).toBeGreaterThan(0);
    await expect.poll(() => notified(friend.id, 'join_request')).toBeGreaterThan(0);

    // "Not this time": the requester hears it.
    await hostPage.goto(eventUrl);
    const requests = hostPage.locator('section', {
      has: hostPage.getByRole('heading', { name: 'Asked to join' }),
    });
    await expect(requests).toContainText(stranger.name);
    await requests.getByRole('button', { name: 'Not this time' }).click();
    await expect(hostPage.getByText(`We’ll let ${stranger.name} know it’s not this time.`)).toBeVisible();
    await expect.poll(() => notified(stranger.id, 'join_declined')).toBeGreaterThan(0);
    await asker.goto('/notifications');
    await expect(asker.getByText('Not this time').first()).toBeVisible();

    // They may ask again, and this time the host welcomes them in.
    await ask();
    await hostPage.reload();
    await requests.getByRole('button', { name: 'Welcome in' }).click();
    await expect(hostPage.getByText(`${stranger.name} is in.`)).toBeVisible();
    await expect.poll(async () => (await inviteOf(eventId, stranger.id)).status).toBe('accepted');
    await expect.poll(() => notified(stranger.id, 'join_approved')).toBeGreaterThan(0);
    await askerContext.close();

    // Open Table can be switched off afterwards, from Edit plan.
    await hostPage.goto(`${eventUrl}/edit`);
    await hostPage.getByLabel(/Open Table/).uncheck();
    await hostPage.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(async () => (await eventRow(eventId)).open_table).toBe(false);
    await hostContext.close();
  });

  test('a host gives a live invitation more time, and a no can become a yes', async ({
    browser,
  }) => {
    const title = unique('Second thoughts ');
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await login(hostPage, host.handle);
    const eventUrl = await createPlan(hostPage, title, {
      People: async (page) => {
        await pickFriend(page, guest.name);
        await pickFriend(page, friend.name);
      },
    });
    const eventId = eventIdOf(eventUrl);

    // The window that is already running can be extended.
    const before = await inviteOf(eventId, guest.id);
    await hostPage.reload();
    await hostPage
      .getByLabel(`Give ${guest.name} more time to answer`)
      .selectOption({ label: '1 more day' });
    await expect
      .poll(async () => (await inviteOf(eventId, guest.id)).window_minutes)
      .toBe(before.window_minutes + 24 * 60);

    // The friend says no, then changes their mind while invitations are out.
    await asPerson(browser, friend.handle, async (page) => {
      await page.goto(eventUrl);
      await page.getByRole('button', { name: 'Can’t make it' }).click();
      await page.getByRole('button', { name: 'Can’t this time - keep asking! 💛' }).click();
      await expect(page.getByText('You said you can’t make it')).toBeVisible();
      await expect.poll(async () => (await inviteOf(eventId, friend.id)).status).toBe('declined');
      await page.getByRole('button', { name: 'Actually, I can come' }).click();
      await page.getByRole('button', { name: 'I’m in ✓' }).click();
      await expect(page.getByText('You’re in ✓')).toBeVisible();
    });
    expect((await inviteOf(eventId, friend.id)).status).toBe('accepted');
    await hostContext.close();
  });

  test('after sending, the host can change the cover, theme, reminders and add a question', async ({
    browser,
  }) => {
    const title = unique('Edit extras ');
    const prompt = unique('Bringing anything? ');
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await login(hostPage, host.handle);
    const eventUrl = await createPlan(hostPage, title, {
      People: async (page) => {
        await pickFriend(page, guest.name);
      },
      Privacy: async (page) => {
        await page.getByLabel(/Require parental approval/).check();
      },
    });
    const eventId = eventIdOf(eventUrl);
    expect(await eventRow(eventId)).toMatchObject({ theme: 'default', reminders_enabled: true });

    await hostPage.goto(`${eventUrl}/edit`);
    // What D18 keeps fixed is named, not silently missing.
    await expect(
      hostPage.getByText('Set when the plan was made, and staying that way: parental approval for every yes.'),
    ).toBeVisible();
    await hostPage.getByRole('button', { name: 'Dusk' }).click();
    await hostPage.getByLabel(/Send reminders/).uncheck();
    await hostPage.getByRole('button', { name: '+ Add a question' }).click();
    await hostPage.getByLabel('New question 1', { exact: true }).fill(prompt);
    // A cover, uploaded the way a host picks a photo.
    await hostPage.locator('input[type="file"]:not([capture])').first().setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFklEQVR4nGNk+M9AEmAiTfmohlENVNMAAJ7sAhFzQ0uJAAAAAElFTkSuQmCC',
        'base64',
      ),
    });
    await expect(hostPage.getByRole('button', { name: 'Remove cover image' })).toBeVisible();
    await hostPage.getByRole('button', { name: 'Save changes' }).click();
    await hostPage.waitForURL(/\/events\/[0-9a-f-]{36}$/);

    const after = await eventRow(eventId);
    expect(after).toMatchObject({ theme: 'dusk', reminders_enabled: false });
    expect(after.cover_url, 'the uploaded cover was not saved').toBeTruthy();

    // The new question is asked when the guest says yes.
    await asPerson(browser, guest.handle, async (page) => {
      await page.goto(eventUrl);
      await expect(page.getByText(prompt)).toBeVisible();
    });
    await hostContext.close();
  });

  test('after the plan, only people who went add to the capsule, and Run it back opens a date poll', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const title = unique('Ran it ');
    const line = unique('Best night ');
    const hostContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    await login(hostPage, host.handle);
    const eventUrl = await createPlan(hostPage, title, {
      Basics: async (page) => {
        await page.locator('#date').fill(localDateTime(2).slice(0, 10));
      },
      People: async (page) => {
        await pickFriend(page, guest.name);
        await pickFriend(page, friend.name);
      },
    });
    const eventId = eventIdOf(eventUrl);

    await asPerson(browser, guest.handle, async (page) => {
      await page.goto(eventUrl);
      await page.getByRole('button', { name: 'I’m in ✓' }).click();
      await expect(page.getByText('You’re in ✓')).toBeVisible();
    });
    await asPerson(browser, friend.handle, async (page) => {
      await page.goto(eventUrl);
      await page.getByRole('button', { name: 'Can’t make it' }).click();
      await page.getByRole('button', { name: 'Can’t this time - keep asking! 💛' }).click();
      await expect(page.getByText('You said you can’t make it')).toBeVisible();
    });

    // Arranged: the guest co-hosts, so the clone has a co-host to carry over.
    await adminClient().from('event_cohosts').insert({ event_id: eventId, cohost_id: guest.id });

    // Time passes: the plan is behind them.
    const { error } = await adminClient()
      .from('events')
      .update({ starts_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), ends_at: null })
      .eq('id', eventId);
    expect(error, error?.message).toBeNull();

    // The guest who went adds a line.
    await asPerson(browser, guest.handle, async (page) => {
      await page.goto(`${eventUrl}/capsule`);
      await page.getByPlaceholder('The moment I want to remember is…').fill(line);
      await page.getByRole('button', { name: 'Add to the capsule' }).click();
      // The saved line, in the capsule itself: the text box still holds what was
      // typed, so matching the words alone passed before the save had landed,
      // and closing the browser then abandoned it.
      await expect(page.locator('blockquote').getByText(line)).toBeVisible();
    });
    // The friend who said no can read it, but not write in it.
    const { data: saved } = await adminClient()
      .from('capsule_entries')
      .select('id')
      .eq('event_id', eventId)
      .eq('line', line);
    expect(saved, 'the guest’s line was never stored').toHaveLength(1);
    await asPerson(browser, friend.handle, async (page) => {
      await page.goto(`${eventUrl}/capsule`);
      try {
        await expect(page.locator('blockquote').getByText(line)).toBeVisible();
      } catch (cause) {
        // Seen once in CI and not locally: say what the friend's access was.
        const { data: invite } = await adminClient()
          .from('invites')
          .select('status, responded_at')
          .eq('event_id', eventId)
          .eq('invitee_id', friend.id)
          .maybeSingle();
        const { data: plan } = await adminClient()
          .from('events')
          .select('status, starts_at')
          .eq('id', eventId)
          .single();
        throw new Error(
          `The declined friend cannot see the capsule line. invite=${JSON.stringify(invite)} ` +
            `plan=${JSON.stringify(plan)} url=${page.url()} ` +
            `page=${(await page.locator('main').innerText().catch(() => '')).slice(0, 300)}`,
          { cause },
        );
      }
      await expect(
        page.getByText('The capsule is written by the people who went and the plan’s hosts.'),
      ).toBeVisible();
      await expect(page.getByPlaceholder('The moment I want to remember is…')).toHaveCount(0);
    });

    // Run it back: a new plan with the same crew, deciding its date.
    await hostPage.goto(eventUrl);
    await hostPage.getByRole('button', { name: '🔁 Run it back' }).click();
    await hostPage.waitForURL((url) => /\/events\/[0-9a-f-]{36}$/.test(url.pathname) && !url.pathname.includes(eventId));
    const cloneId = eventIdOf(hostPage.url());
    await expect(hostPage.getByText('🗳️ Group is deciding')).toBeVisible();
    const clone = await eventRow(cloneId);
    expect(clone.status).toBe('deciding');
    expect(clone.starts_at).toBeNull();
    const { data: polls } = await adminClient().from('polls').select('id').eq('event_id', cloneId);
    expect(polls?.length, 'the clone opened with no date poll').toBeGreaterThan(0);
    const { data: crew } = await adminClient()
      .from('invites')
      .select('invitee_id')
      .eq('event_id', cloneId);
    expect(crew?.map((row) => row.invitee_id).sort()).toEqual([friend.id, guest.id].sort());
    const { data: cohosts } = await adminClient()
      .from('event_cohosts')
      .select('cohost_id')
      .eq('event_id', cloneId);
    expect(cohosts?.map((row) => row.cohost_id)).toEqual([guest.id]);
    await hostContext.close();
  });

  // Answering revalidates /approve/<token>, so the server page renders over the client's
  // own confirmation; it once said only "This has already been denied.", as if someone else
  // had answered. It must say what the answer did, and say it again on a reopen.
  test('the guardian is told what their answer did', async ({ browser }) => {
    test.setTimeout(150_000);
    requireMailRelay();
    const title = unique('Guardian says ');
    const guardianEmail = `${unique('parent')}@example.com`;
    await asPerson(browser, host.handle, (page) =>
      createPlan(page, title, {
        People: async (wizard) => {
          await pickFriend(wizard, guest.name);
        },
        Privacy: async (wizard) => {
          await wizard.getByLabel(/Require parental approval/).check();
        },
      }).then(async (url) => {
        await asPerson(browser, guest.handle, async (guestPage) => {
          await guestPage.goto(url);
          await guestPage.getByRole('button', { name: 'I’m in ✓' }).click();
          await guestPage.getByLabel('Guardian’s email').fill(guardianEmail);
          await guestPage.getByRole('button', { name: 'Send approval request' }).click();
          await expect(guestPage.getByText(/We emailed/)).toBeVisible();
        });
      }),
    );

    const mail = await waitForMail(guardianEmail, `wants to join ${title}`);
    const context = await browser.newContext();
    const guardian = await context.newPage();
    await guardian.goto(linkIn(mail, '/approve/'));
    await guardian.getByRole('button', { name: 'Deny' }).click();
    await expect(guardian.getByText('Denied', { exact: true })).toBeVisible();
    await expect(guardian.getByText(`${guest.name}’s RSVP for`)).toContainText('was denied');
    await guardian.reload();
    await expect(guardian.getByText(`${guest.name}’s RSVP for`)).toContainText(title);
    await context.close();
  });
});
