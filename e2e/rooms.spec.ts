import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';
import {
  adminClient,
  createAccount,
  DB,
  expectToast,
  login,
  pageComplaints,
  unique,
  type Account,
} from './support';

/**
 * A plan's room, used by the people in it: who is here and where the room came
 * from, mute and leave (D20), messages and the inbox arriving live (G12),
 * deleting your own message and reaching past the newest 200 (G30), splitting
 * the bill with a chosen payer and settling up (G3, G31, D21), photos kept in
 * private storage (G2), and the fallbacks a reader is told about (G32, G33).
 *
 * One plan is made through the wizard by a throwaway host, and two throwaway
 * friends accept it through the plan page, which is what puts all three in the
 * room. The journeys then run in order against that one room, each person in
 * their own browser, so a realtime update is always seen by someone other than
 * the person who caused it. The service role only arranges: it connects the
 * friends, backfills 210 old messages, backdates a read marker, and ends the
 * plan for the last journey. It never sends, ticks, pays or leaves for anyone.
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

/** Walk the wizard to Review, picking `friends` on the People step, and send. */
async function createPlan(page: Page, title: string, friends: string[]): Promise<string> {
  await page.goto('/events/new');
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title);
  await page.getByLabel('Details', { exact: true }).fill('Seeded by the rooms e2e suite.');
  for (let guard = 0; guard < 8; guard += 1) {
    const step = await currentStep(page);
    if (step === 'Review') break;
    if (step === 'People') {
      for (const friend of friends) {
        await page.getByRole('button', { name: new RegExp(friend) }).click();
      }
      await expect(page.getByText(`${friends.length} people selected`)).toBeVisible();
    }
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await expect(
      next,
      `The wizard would not leave ${step}. On screen: ${(await pageComplaints(page)) || 'nothing'}`,
    ).toBeEnabled({ timeout: 5_000 });
    await next.click();
    await expect.poll(() => currentStep(page)).not.toBe(step);
  }
  await page.getByRole('button', { name: /Send invitations|Create & start deciding/ }).click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 45_000 });
  return page.url();
}

/** Accept the plan from its page, as an invited friend. */
async function acceptPlan(page: Page, eventUrl: string): Promise<void> {
  await page.goto(eventUrl);
  const yes = page.getByRole('button', { name: /I.?m in/ });
  await yes.click();
  // "You're invited" also matches /You.?re in/, so wait for the answer to go.
  await expect(yes).toHaveCount(0);
}

async function personIn(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account.handle);
  return page;
}

/**
 * The person's own access token, read from the session cookie the app set.
 * Used to try a write straight against the API as that member, which is what a
 * member who wanted to get round the screen would do.
 */
async function accessTokenOf(context: BrowserContext): Promise<string> {
  const parts = (await context.cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  if (parts.length === 0) throw new Error('No Supabase session cookie in this browser');
  let raw = parts.map((cookie) => cookie.value).join('');
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64url').toString('utf8');
  return (JSON.parse(raw) as { access_token: string }).access_token;
}

/** A small, real PNG (solid colour), built here so the suite needs no fixture file. */
function png(size = 24): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([200, 80, 60]))]);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL must be set (see e2e/README.md)');
  return url.replace(/\/$/, '');
}

function anonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see e2e/README.md)');
  return key;
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('');
}

async function openTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

async function confirmDialog(page: Page, label: string): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
}

test.describe('rooms', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'room journeys run against the desktop app shell');
  test.describe.configure({ mode: 'serial' });

  const tag = unique('rm');
  const title = `Room plan ${tag}`;
  let host: Account;
  let bo: Account;
  let cy: Account;
  let eventId: string;
  let roomId: string;
  let roomUrl: string;
  let hana: Page;
  let boPage: Page;
  let cyPage: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    host = await createAccount({ handle: `${tag}h`, name: 'Hana Host' });
    bo = await createAccount({ handle: `${tag}b`, name: 'Bo Guest' });
    cy = await createAccount({ handle: `${tag}c`, name: 'Cy Guest' });
    for (const friend of [bo, cy]) {
      const { error } = await adminClient()
        .from('connections')
        .insert({ requester_id: host.id, addressee_id: friend.id, status: 'accepted' });
      if (error) throw error;
    }

    hana = await personIn(browser, host);
    const eventUrl = await createPlan(hana, title, ['Bo Guest', 'Cy Guest']);
    eventId = eventUrl.match(/\/events\/([0-9a-f-]{36})/)![1];

    boPage = await personIn(browser, bo);
    await acceptPlan(boPage, eventUrl);
    cyPage = await personIn(browser, cy);
    await acceptPlan(cyPage, eventUrl);

    const { data: event, error } = await adminClient()
      .from('events')
      .select('room_id')
      .eq('id', eventId)
      .single();
    if (error) throw error;
    roomId = event.room_id as string;
    expect(roomId, 'the plan has no room').toBeTruthy();
    roomUrl = `/rooms/${roomId}`;
  });

  test.afterAll(async () => {
    for (const page of [hana, boPage, cyPage]) await page?.context().close();
  });

  test('the room says who is here, links back to the plan, and explains mute and leave', async () => {
    // Found from the inbox, not by URL.
    await hana.goto('/rooms');
    await hana.getByRole('link', { name: new RegExp(title) }).click();
    await hana.waitForURL(`**${roomUrl}`);

    await expect(hana.getByText('Bo and Cy', { exact: true })).toBeVisible();
    await expect(hana.getByText('3 people · tap for details')).toBeVisible();
    await hana.getByRole('button', { name: /tap for details/ }).click();
    const members = hana.getByRole('list').filter({ hasText: 'Hana Host (you)' });
    await expect(members.getByRole('listitem')).toContainText(['Hana Host (you)', 'Bo Guest', 'Cy Guest']);
    await expect(members.getByRole('listitem')).toHaveCount(3);
    await expect(members.getByRole('link', { name: 'Bo Guest' })).toHaveAttribute(
      'href',
      `/u/${bo.handle}?from=${roomUrl}`,
    );
    // D20: a plan's room can't be left while the plan is on; it can be muted.
    await expect(hana.getByText('You can leave a plan’s room once the plan is over. Until then, mute it.')).toBeVisible();
    await expect(hana.getByRole('button', { name: 'Leave this room' })).toHaveCount(0);

    // Mute, and the inbox says so; unmute again.
    await hana.getByRole('button', { name: 'Mute this room' }).click();
    await expectToast(hana, 'Muted. This room won’t notify you.');
    await expect(hana.getByText(/Muted: this room won’t send you notifications/)).toBeVisible();
    await hana.goto('/rooms');
    await expect(hana.getByRole('link', { name: new RegExp(title) })).toContainText('Muted ·');
    await hana.goBack();
    await hana.getByRole('button', { name: 'Unmute this room' }).click();
    await expectToast(hana, 'Unmuted.');

    // The way back to the plan.
    await hana.getByRole('link', { name: 'The plan' }).click();
    await hana.waitForURL(`**/events/${eventId}`);
    await expect(hana.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });

  test('messages reach the room and the inbox live, and a sender can delete their own', async () => {
    await boPage.goto('/rooms');
    const boInboxRow = boPage.getByRole('link', { name: new RegExp(title) });
    await expect(boInboxRow).toBeVisible();
    await cyPage.goto(roomUrl);
    await expect(cyPage.getByRole('tablist', { name: 'Room sections' })).toBeVisible();
    await hana.goto(roomUrl);

    const hello = `Hello from Hana ${tag}`;
    await send(hana, hello);
    // Cy, already in the room, and Bo, on the inbox, see it without reloading.
    await expect(cyPage.getByText(hello)).toBeVisible();
    await expect(boInboxRow).toContainText(hello);
    // ...and a second one, so the inbox keeps listening after the first.
    const second = `Second line ${tag}`;
    await send(hana, second);
    await expect(boInboxRow).toContainText(second);

    // Delete your own message.
    const typo = `Typo message ${tag}`;
    await send(hana, typo);
    await expect(cyPage.getByText(typo)).toBeVisible();
    await hana.getByRole('button', { name: 'Options for your message' }).filter({ hasText: typo }).click();
    await hana.getByRole('button', { name: 'Delete message' }).click();
    await confirmDialog(hana, 'Delete');
    await expect(hana.getByText(typo)).toHaveCount(0);
    // Someone else's message offers no delete, only report and block.
    await cyPage.getByRole('button', { name: 'Options for Hana Host' }).first().click();
    await expect(cyPage.getByRole('button', { name: 'Report message' })).toBeVisible();
    await expect(cyPage.getByRole('button', { name: 'Delete message' })).toHaveCount(0);
    await cyPage.keyboard.press('Escape');
    // Gone for everyone, and from the database.
    await cyPage.reload();
    await expect(cyPage.getByText(second)).toBeVisible();
    await expect(cyPage.getByText(typo)).toHaveCount(0);
    const { count } = await adminClient()
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('body', typo);
    expect(count).toBe(0);
  });

  // RoomClient once listened for inserts only, so a deleted message stayed on others' screens.
  test('a message deleted by its sender disappears for others without a reload', async () => {
    await cyPage.goto(roomUrl);
    await hana.goto(roomUrl);
    const oops = `Oops ${tag}`;
    await send(hana, oops);
    await expect(cyPage.getByText(oops)).toBeVisible();
    await hana.getByRole('button', { name: 'Options for your message' }).filter({ hasText: oops }).click();
    await hana.getByRole('button', { name: 'Delete message' }).click();
    await confirmDialog(hana, 'Delete');
    await expect(hana.getByText(oops)).toHaveCount(0);
    await expect(cyPage.getByText(oops)).toHaveCount(0);
  });

  test('a muted member is not notified, and an unmuted one is', async () => {
    await cyPage.goto(roomUrl);
    await cyPage.getByRole('button', { name: 'Mute this room' }).click();
    await expectToast(cyPage, 'Muted. This room won’t notify you.');
    // Neither Cy nor Hana is looking at the room now; a recent read would
    // otherwise (correctly) hold back the notification for both.
    await cyPage.goto('/rooms');
    await hana.goto('/rooms');
    const earlier = new Date(Date.now() - 60 * 60_000).toISOString();
    await adminClient()
      .from('room_members')
      .update({ last_read_at: earlier })
      .eq('room_id', roomId)
      .in('member_id', [host.id, cy.id]);
    const since = new Date(Date.now() - 2_000).toISOString();

    await boPage.goto(roomUrl);
    await send(boPage, `Anyone bringing ice? ${tag}`);

    const notified = async (userId: string) => {
      const { count, error } = await adminClient()
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('url', roomUrl)
        .gte('created_at', since);
      if (error) throw error;
      return count ?? 0;
    };
    await expect.poll(() => notified(host.id)).toBeGreaterThan(0);
    expect(await notified(cy.id), 'a muted member was notified').toBe(0);
  });

  test('filed tasks and expenses update live for the others', async () => {
    await boPage.goto(roomUrl);
    await cyPage.goto(roomUrl);
    await hana.goto(roomUrl);
    await send(hana, `I'll bring the chips ${tag}`);

    // The message files itself as a task, which Cy sees appear without reloading.
    await openTab(cyPage, /Tasks/);
    const cyTask = cyPage.getByRole('checkbox', { name: /chips/ });
    await expect(cyTask).toBeVisible();
    await expect(cyTask).not.toBeChecked();

    // Bo ticks it; Cy sees it ticked.
    await openTab(boPage, /Tasks/);
    const boTask = boPage.getByRole('checkbox', { name: /chips/ });
    await boTask.click();
    await expect(boPage.getByRole('checkbox', { name: /chips/ })).toBeChecked();
    await expect(cyTask).toBeChecked();

    // Hana logs an expense; Cy, on the Split tab, sees it arrive.
    await openTab(cyPage, /Split/);
    await expect(cyPage.getByText('No expenses yet')).toBeVisible();
    await openTab(hana, /Split/);
    await hana.getByLabel('Expense description').fill(`Ice ${tag}`);
    await hana.getByLabel('Amount in US dollars').fill('6');
    await hana.getByRole('button', { name: 'Add expense' }).click();
    await expect(hana.getByText(`Ice ${tag}`)).toBeVisible();
    await expect(cyPage.getByText(`Ice ${tag}`)).toBeVisible();
    await expect(cyPage.getByText('You owe $2.00 in all.')).toBeVisible();

    // Hana removes it again so the ledger journey starts clean.
    await hana.getByRole('button', { name: 'remove' }).click();
    await confirmDialog(hana, 'Delete');
    await expect(hana.getByText(`Ice ${tag}`)).toHaveCount(0);
  });

  test('split the bill: anyone in the room can be the payer, balances and settling', async () => {
    for (const page of [hana, boPage, cyPage]) {
      await page.goto(roomUrl);
      await openTab(page, /Split/);
    }

    // D21: Hana logs a dinner Bo paid for, split three ways. Only the room's
    // people can be chosen as the payer.
    const dinner = `Dinner ${tag}`;
    const payer = hana.getByLabel('Who paid');
    await expect(payer.locator('option')).toHaveText(['You', 'Bo Guest', 'Cy Guest']);
    await expect(hana.getByLabel('Amount in US dollars')).toHaveAttribute('placeholder', 'Amount ($)');
    await hana.getByLabel('Expense description').fill(dinner);
    await hana.getByLabel('Amount in US dollars').fill('30');
    await payer.selectOption({ label: 'Bo Guest' });
    await expect(hana.getByText('About $10.00 each for 3 people.')).toBeVisible();
    await hana.getByRole('button', { name: 'Add expense' }).click();
    const hanaRow = hana.getByRole('listitem').filter({ hasText: dinner });
    await expect(hanaRow).toContainText('Bo Guest paid · split 3 ways');
    await expect(hanaRow).toContainText('$30.00');

    // Everyone sees their own side and everyone else's.
    await expect(hana.getByText('You owe $10.00 in all.')).toBeVisible();
    await expect(hana.getByText('Cy owes Bo $10.00')).toBeVisible();
    await expect(boPage.getByText('You’re owed $20.00 in all.')).toBeVisible();
    await expect(boPage.getByText(/Hana owes you\s*\$10\.00/)).toBeVisible();
    await expect(boPage.getByText(/Cy owes you\s*\$10\.00/)).toBeVisible();
    await expect(cyPage.getByText('You owe $10.00 in all.')).toBeVisible();

    // A two-person expense: Cy paid for Bo and Cy only, $8.
    const taxi = `Taxi ${tag}`;
    await cyPage.getByLabel('Expense description').fill(taxi);
    await cyPage.getByLabel('Amount in US dollars').fill('8');
    await cyPage.getByRole('group', { name: 'Split between' }).getByRole('button', { name: 'Hana' }).click();
    await expect(cyPage.getByText('About $4.00 each for 2 people.')).toBeVisible();
    await cyPage.getByRole('button', { name: 'Add expense' }).click();
    await expect(cyPage.getByRole('listitem').filter({ hasText: taxi })).toContainText('split 2 ways (');
    // Bo owed Cy $4 and Cy owes Bo $10: netted to Cy owing Bo $6.
    await expect(cyPage.getByText(/You owe Bo\s*\$6\.00/)).toBeVisible();
    await expect(boPage.getByText(/Cy owes you\s*\$6\.00/)).toBeVisible();

    // Bo and Cy settle up; Cy sees it without reloading. Hana still owes Bo.
    const cyLine = boPage.getByRole('listitem').filter({ hasText: /Cy owes you/ });
    await cyLine.getByRole('button', { name: 'Mark settled' }).click();
    await confirmDialog(boPage, 'Mark settled');
    await expectToast(boPage, 'You and Cy are square.');
    await expect(cyPage.getByText('You’re all square.')).toBeVisible();
    await expect(cyPage.getByRole('listitem').filter({ hasText: taxi })).toContainText('Settled');
    await expect(boPage.getByText(/Hana owes you\s*\$10\.00/)).toBeVisible();
    await expect(boPage.getByRole('listitem').filter({ hasText: dinner })).not.toContainText('Settled');

    // Hana settles her side; now the dinner is settled for everyone.
    await hana.getByRole('listitem').filter({ hasText: /You owe Bo/ }).getByRole('button', { name: 'Mark settled' }).click();
    await confirmDialog(hana, 'Mark settled');
    await expectToast(hana, 'You and Bo are square.');
    await expect(boPage.getByRole('listitem').filter({ hasText: dinner })).toContainText('Settled');
    await expect(boPage.getByText('You’re all square.')).toBeVisible();
  });

  test('a member cannot log an expense paid by someone outside the room', async () => {
    // Someone real, but not in this room.
    const outsider = await createAccount({ handle: `${tag}x`, name: 'Xan Outsider' });
    const token = await accessTokenOf(boPage.context());
    const headers = {
      apikey: anonKey(),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Through the same function the app uses...
    const viaRpc = await fetch(`${supabaseUrl()}/rest/v1/rpc/save_expense`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_room: roomId,
        p_description: `Phantom ${tag}`,
        p_amount_cents: 5000,
        p_payer: outsider.id,
        p_participants: [bo.id],
      }),
    });
    expect(viaRpc.ok, 'save_expense accepted an outside payer').toBe(false);
    // ...and straight into the table.
    const direct = await fetch(`${supabaseUrl()}/rest/v1/expenses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        room_id: roomId,
        description: `Phantom ${tag}`,
        amount_cents: 5000,
        payer_id: outsider.id,
        created_by: bo.id,
      }),
    });
    expect(direct.ok, 'the expenses insert policy accepted an outside payer').toBe(false);
    // Nor may Bo write a row as if Hana had logged it.
    const asHana = await fetch(`${supabaseUrl()}/rest/v1/expenses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        room_id: roomId,
        description: `Phantom ${tag}`,
        amount_cents: 5000,
        payer_id: bo.id,
        created_by: host.id,
      }),
    });
    expect(asHana.ok).toBe(false);

    const { count } = await adminClient()
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('description', `Phantom ${tag}`);
    expect(count).toBe(0);
  });

  test('a room photo is private: members see it, an anonymous request does not', async () => {
    await boPage.goto(roomUrl);
    await hana.goto(roomUrl);
    await boPage.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'cake.png',
      mimeType: 'image/png',
      buffer: png(),
    });

    // Hana sees it arrive, through a signed URL into the private bucket.
    const photo = hana.getByRole('img', { name: 'Shared photo' }).last();
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/media-private\//);
    const src = (await photo.getAttribute('src'))!;

    // What was stored is a path in Bo's own folder of the private bucket.
    const { data: rows } = await adminClient()
      .from('messages')
      .select('image_url')
      .eq('room_id', roomId)
      .not('image_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const path = rows![0].image_url as string;
    expect(path.startsWith(`${bo.id}/`), `stored ref was ${path}`).toBe(true);

    // Anyone without the signature gets nothing.
    const asPublic = await fetch(`${supabaseUrl()}/storage/v1/object/public/media-private/${path}`);
    expect(asPublic.ok, 'the private bucket served the photo publicly').toBe(false);
    const asAnon = await fetch(`${supabaseUrl()}/storage/v1/object/media-private/${path}`, {
      headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` },
    });
    expect(asAnon.ok, 'an anonymous request read the private photo').toBe(false);
    // The signed URL itself works (that is what the member's browser loaded).
    const signed = await fetch(new URL(src, supabaseUrl()).toString());
    expect(signed.ok).toBe(true);

    // It is filed in the Photos tab for the room, also signed.
    await openTab(hana, /Photos/);
    await expect(hana.getByRole('img', { name: 'Photo' }).first()).toHaveAttribute(
      'src',
      /\/storage\/v1\/object\/sign\/media-private\//,
    );
  });

  // img-src once allowed only https:, so a signed URL from a Supabase served over http (the
  // local stack every e2e and dev run uses) was refused and the photo never showed.
  test('a room photo renders for the other members', async () => {
    await hana.goto(roomUrl);
    const photo = hana.getByRole('img', { name: 'Shared photo' }).last();
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
  });

  test('a long conversation opens on its newest messages and can load the earlier ones', async () => {
    // 210 messages from last week, older than anything said today.
    const start = Date.now() - 7 * 86_400_000;
    const rows = Array.from({ length: 210 }, (_, i) => ({
      room_id: roomId,
      sender_id: bo.id,
      body: `Old message ${String(i + 1).padStart(3, '0')} ${tag}`,
      created_at: new Date(start + i * 60_000).toISOString(),
    }));
    const { error } = await adminClient().from('messages').insert(rows);
    expect(error, error?.message).toBeNull();

    await cyPage.goto(roomUrl);
    await expect(cyPage.getByText(`Old message 210 ${tag}`)).toBeAttached();
    await expect(cyPage.getByText(`Old message 001 ${tag}`)).toHaveCount(0);
    await cyPage.getByRole('button', { name: 'Load earlier messages' }).click();
    await expect(cyPage.getByText(`Old message 001 ${tag}`)).toBeAttached();
    await expect(cyPage.getByRole('button', { name: 'Load earlier messages' })).toHaveCount(0);
    // Every message appears once.
    await expect(cyPage.getByText(`Old message 100 ${tag}`)).toHaveCount(1);
  });

  test('Notes says why it is quiet without smart filing; voice notes explain an unsupported browser', async ({
    browser,
  }) => {
    await cyPage.goto(roomUrl);
    await openTab(cyPage, /Notes/);
    await expect(
      cyPage.getByText(/Smart filing isn’t available right now, so only links, street addresses and\s+to-dos/),
    ).toBeVisible();

    // A browser with no MediaRecorder, on the plan's thread.
    const context = await browser.newContext({ storageState: await cyPage.context().storageState() });
    await context.addInitScript(() => {
      // @ts-expect-error simulating a browser without recording support
      delete window.MediaRecorder;
    });
    const old = await context.newPage();
    await old.goto(`/events/${eventId}`);
    await expect(old.getByText(/Voice notes need a browser that can record audio, and this one can’t\./)).toBeVisible();
    await expect(old.getByRole('button', { name: 'Record voice note' })).toHaveCount(0);
    await context.close();
  });

  // The CSP once had no media-src, so default-src 'self' refused every signed voice-note URL
  // (in production too) and Play silently did nothing.
  test('a voice note on the plan thread can be played', async () => {
    const path = `${host.id}/voice-${tag}.webm`;
    const { error: uploadError } = await adminClient()
      .storage.from('media-private')
      .upload(path, Buffer.from('not really audio'), { contentType: 'audio/webm' });
    expect(uploadError, uploadError?.message).toBeNull();
    const { error } = await adminClient()
      .from('event_comments')
      .insert({ event_id: eventId, author_id: host.id, voice_url: path, voice_duration_seconds: 3 });
    expect(error, error?.message).toBeNull();

    const refused: string[] = [];
    boPage.on('console', (message) => {
      if (/Refused to load media/.test(message.text())) refused.push(message.text());
    });
    await boPage.goto(`/events/${eventId}`);
    await boPage.getByRole('button', { name: 'Play voice note' }).first().click();
    await boPage.waitForTimeout(1_000);
    expect(refused, 'the page refused to load the voice note').toEqual([]);
  });

  test('once the plan is over, a member can leave its room', async () => {
    const { error } = await adminClient().from('events').update({ status: 'past' }).eq('id', eventId);
    expect(error, error?.message).toBeNull();

    await cyPage.goto('/rooms');
    // Filed under Past now.
    const past = cyPage.locator('section').filter({ has: cyPage.getByRole('heading', { name: 'Past' }) });
    await expect(past.getByRole('link', { name: new RegExp(title) })).toBeVisible();
    await past.getByRole('link', { name: new RegExp(title) }).click();
    await cyPage.waitForURL(`**${roomUrl}`);
    await cyPage.getByRole('button', { name: /tap for details/ }).click();
    await cyPage.getByRole('button', { name: 'Leave this room' }).click();
    await confirmDialog(cyPage, 'Leave');
    await cyPage.waitForURL('**/rooms');
    await expect(cyPage.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);

    // The others see one fewer person.
    await boPage.goto(roomUrl);
    await expect(boPage.getByText('2 people · tap for details')).toBeVisible();
  });

  // The plan page once showed its "❋ Room" link to anyone who could see the plan (invited
  // but not yet in, declined, or left), and for them it opened the generic "Nothing here" 404.
  test('the plan page does not send someone who left the room to a dead end', async () => {
    await cyPage.goto(`/events/${eventId}`);
    await expect(cyPage.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(cyPage.getByRole('link', { name: '❋ Room', exact: true })).toHaveCount(0);
  });
});
