import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import {
  adminClient,
  createAccount,
  DB,
  expectToast,
  PASSWORD,
  signedInAs,
  submitSignIn,
  unique,
  type Account,
} from './support';

/**
 * Safety and moderation, walked as the people involved: someone who reports,
 * the person reported, and a moderator who acts on it; someone who blocks a
 * person they share rooms with; someone who asks for space; someone on
 * sabbatical; and two strangers who find each other through discovery.
 *
 * Every journey makes its own throwaway accounts (the seeded users' sessions
 * belong to the other specs). The service role only arranges what has no
 * button: appointing a moderator (docs/DEPLOYMENT.md, "Appointing
 * moderators"), a friendship that is months old, or a shared room the test
 * needs as a stage. The step under test is always a click.
 */

/**
 * The cookies the app's own sign-in would set for `account`, made by the same
 * library (`@supabase/ssr`) straight against the auth server.
 *
 * The app's sign-in form allows 30 attempts per connection per ten minutes,
 * shared by every spec and every agent on this machine (e2e/README.md,
 * "Sign-in rate limit"). These journeys need five or six people each, so
 * spending the form on every one of them would starve the rest of the suite.
 * The form is used where signing in is the step under test (a suspended
 * account being refused, then let back in).
 */
async function sessionCookiesFor(account: Account) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const jar = new Map<string, string>();
  const client = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) jar.set(name, value);
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw error;
  await expect.poll(() => jar.size, { message: 'the auth library never wrote a session cookie' }).toBeGreaterThan(0);
  const host = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000').hostname;
  return [...jar]
    .filter(([, value]) => value)
    .map(([name, value]) => ({ name, value, domain: host, path: '/', sameSite: 'Lax' as const }));
}

/** A browser of one's own for each person, signed in, so their sessions never mix. */
async function personPage(browser: Browser, account: Account): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await context.addCookies(await sessionCookiesFor(account));
  const page = await context.newPage();
  expect(await signedInAs(page, account.handle), `the app does not show @${account.handle} as signed in`).toBe(true);
  return { context, page };
}

async function confirmDialog(page: Page, title: string | RegExp, button: string) {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: button, exact: true }).click();
}

/** Answer a "why?" prompt (Report, Flag) with `reason` and send it. */
async function answerPrompt(page: Page, title: string | RegExp, reason: string, button: string) {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill(reason);
  await dialog.getByRole('button', { name: button, exact: true }).click();
}

/** Two people as accepted friends, connected `daysAgo` days ago. */
async function befriend(a: Account, b: Account, daysAgo = 0) {
  const { error } = await adminClient()
    .from('connections')
    .insert({
      requester_id: a.id,
      addressee_id: b.id,
      status: 'accepted',
      created_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    });
  if (error) throw error;
}

/**
 * A plan's room with these members, as the stage for a room journey. Rooms are
 * only ever opened by the database as a side effect of a plan, a match or a
 * moment; this one stands in for a plan's Living Room so the journey can start
 * at "we share a room".
 */
async function sharedPlanRoom(title: string, members: Account[]): Promise<string> {
  const admin = adminClient();
  const { data: room, error } = await admin
    .from('rooms')
    .insert({ kind: 'event', title, created_by: members[0].id })
    .select('id')
    .single();
  if (error) throw error;
  const { error: memberError } = await admin
    .from('room_members')
    .insert(members.map((member) => ({ room_id: room.id, member_id: member.id })));
  if (memberError) throw memberError;
  return room.id as string;
}

/**
 * Send a message and wait for the server to answer. The bubble appears at once
 * (optimistically), before the server has the row, and leaving the page while
 * the action is still in flight loses the message.
 */
async function sendInRoom(page: Page, text: string) {
  await page.getByLabel('Message', { exact: true }).fill(text);
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('/rooms/'),
  );
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await saved;
  await expect(page.getByText(text)).toBeVisible();
}

async function newAccount(prefix: string, name: string): Promise<Account> {
  return createAccount({ handle: unique(prefix), name });
}

/** Appoint a moderator. There is deliberately no button for this (docs/DEPLOYMENT.md). */
async function appointModerator(account: Account) {
  const { error } = await adminClient().from('platform_moderators').insert({ member_id: account.id });
  if (error) throw error;
}

/** Report someone from their profile, the way anyone can. */
async function reportProfile(page: Page, account: Account, reason: string) {
  await page.goto(`/u/${account.handle}`);
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await answerPrompt(page, `Report ${account.name}?`, reason, 'Send report');
  await expectToast(page, 'Report received.');
}

/** The open report in the moderation queue whose reason is `reason`. */
function reportCard(page: Page, reason: string) {
  return page.locator('li', { hasText: reason });
}

/** Suspend the person a report is about, from the queue, for seven days. */
async function suspendFromQueue(page: Page, reason: string, account: Account) {
  const card = reportCard(page, reason);
  await card.getByRole('button', { name: 'Suspend account…' }).click();
  await card.getByLabel('How long').selectOption({ label: 'For 7 days' });
  await card.getByRole('button', { name: 'Suspend', exact: true }).click();
  await confirmDialog(page, `Suspend ${account.name}?`, 'Suspend');
  await expectToast(page, `${account.name} is suspended.`);
}

/** Text in the notification feed, read fresh. */
async function notificationsSay(page: Page): Promise<string> {
  await page.goto('/notifications');
  await page.waitForLoadState('networkidle');
  return page.getByRole('main').last().innerText();
}


const TITLE_PLACEHOLDER = 'Coffee downtown, Game night, Saturday hike…';

/** The wizard step on screen, by name, from the progress bar. */
async function currentStep(page: Page): Promise<string> {
  const current = page.getByRole('list', { name: 'Steps' }).locator('[aria-current="step"]');
  const label = (await current.getAttribute('aria-label')) ?? '';
  return label.match(/^Step \d+, (.+)$/)?.[1] ?? label;
}

/** Walk the plan wizard to Review, running `onPeople` on the People step, and send. */
async function sendPlan(page: Page, title: string, onPeople: (page: Page) => Promise<void>) {
  await page.goto('/events/new');
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title);
  await page.getByLabel('Details', { exact: true }).fill('Seeded by the safety e2e suite.');
  for (let guard = 0; guard < 8; guard += 1) {
    const step = await currentStep(page);
    if (step === 'Review') break;
    if (step === 'People') await onPeople(page);
    const next = page.getByRole('button', { name: 'Next', exact: true });
    await expect(next).toBeEnabled({ timeout: 5_000 });
    await next.click();
    await expect.poll(() => currentStep(page)).not.toBe(step);
  }
  await page.getByRole('button', { name: /Send invitations|Create & start deciding/ }).click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 45_000 });
}

test.describe('safety and moderation', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'these journeys run against the desktop app shell');

  test('a moderator sees what was reported, even after it was deleted, and takes it down', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const reporter = await newAccount('saferep', 'Rhea Reporter');
    const author = await newAccount('safeauth', 'Otto Offender');
    const moderator = await newAccount('safemod', 'Mona Moderator');
    await befriend(reporter, author);
    await appointModerator(moderator);

    const roomTitle = unique('Picnic room ');
    const roomId = await sharedPlanRoom(roomTitle, [reporter, author]);
    const rude = unique('You are all idiots ');
    const regret = unique('Deleted insult ');
    const boardName = unique('Elm Street ');
    const post = unique('Buy my pills ');
    // The queue is shared by every moderator and every run, so each reason
    // names this run.
    const rudeReason = unique('Insulting the group ');
    const regretReason = unique('Also insulting ');
    const postReason = unique('Selling drugs ');

    // The reporter starts a board and adds the author to it.
    const r = await personPage(browser, reporter);
    await r.page.goto('/boards');
    await r.page.getByLabel('Board name').fill(boardName);
    await r.page.getByLabel('Board description').fill('Our street.');
    await r.page.getByRole('button', { name: 'Create board' }).click();
    await r.page.waitForURL(/\/boards\/[^/?]+$/, { timeout: 15_000 });
    const boardUrl = r.page.url();
    await r.page.getByLabel('Invite by handle').fill(author.handle);
    await r.page.getByRole('button', { name: 'Invite', exact: true }).click();
    await expectToast(r.page, `Added @${author.handle}.`);

    // The author writes two messages in the room they share, and posts on the board.
    const o = await personPage(browser, author);
    await o.page.goto(`/rooms/${roomId}`);
    await sendInRoom(o.page, rude);
    await sendInRoom(o.page, regret);
    await o.page.goto(boardUrl);
    await o.page.getByLabel('Title').fill(post);
    await o.page.getByRole('button', { name: 'Post to the board' }).click();
    await expectToast(o.page, 'Posted to the board.');

    // The reporter flags both messages, from the sender's avatar, and the post.
    await r.page.goto(`/rooms/${roomId}`);
    for (const [message, reason] of [
      [rude, rudeReason],
      [regret, regretReason],
    ]) {
      const bubble = r.page.locator('div.flex.gap-2\\.5', { hasText: message }).last();
      await bubble.getByRole('button', { name: `Options for ${author.name}` }).click();
      await r.page.getByRole('button', { name: 'Report message' }).click();
      await answerPrompt(r.page, `Report this message from ${author.name}?`, reason, 'Send report');
      await expectToast(r.page, 'Report received.');
    }
    await r.page.goto(boardUrl);
    await r.page.locator('li', { hasText: post }).getByRole('button', { name: 'report' }).click();
    await answerPrompt(r.page, 'What’s wrong with this post?', postReason, 'Send to moderators');
    await expectToast(r.page, 'Sent to the moderators. Thanks for flagging it.');

    // Then the author deletes one of the messages. The report keeps its words
    // (D7: a room-message report carries a snapshot of the message).
    await o.page.goto(`/rooms/${roomId}`);
    await o.page.getByRole('button', { name: 'Options for your message' }).filter({ hasText: regret }).click();
    await o.page.getByRole('button', { name: 'Delete message' }).click();
    await confirmDialog(o.page, 'Delete this message?', 'Delete');
    await expect(o.page.getByText(regret)).toHaveCount(0);

    // The moderator finds the queue in Settings, and each report shows what was flagged.
    const m = await personPage(browser, moderator);
    await m.page.goto('/settings');
    await m.page.getByRole('link', { name: 'Open the moderation queue' }).click();
    await m.page.waitForURL(/\/moderation$/);
    const messageCard = reportCard(m.page, rudeReason);
    await expect(messageCard.getByText(`${reporter.name} reported a message from ${author.name}`)).toBeVisible();
    await expect(messageCard.getByText('The message they flagged')).toBeVisible();
    await expect(messageCard.getByText(rude, { exact: true })).toBeVisible();
    await expect(messageCard.getByText(`· in ${roomTitle}`)).toBeVisible();
    const deletedCard = reportCard(m.page, regretReason);
    await expect(deletedCard.getByText(regret, { exact: true })).toBeVisible();
    await expect(deletedCard.getByText('Its sender has since deleted it.')).toBeVisible();
    await expect(deletedCard.getByRole('button', { name: 'Remove message' })).toHaveCount(0);
    const postCard = reportCard(m.page, postReason);
    await expect(postCard.getByText(`${reporter.name} reported a post by ${author.name}`)).toBeVisible();
    await expect(postCard.getByText(post, { exact: true })).toBeVisible();

    // Take the message down, and the post.
    await messageCard.getByRole('button', { name: 'Remove message' }).click();
    await confirmDialog(m.page, 'Remove this message?', 'Remove');
    await expectToast(m.page, 'Message removed.');
    await expect(messageCard.getByText(/Members no longer see it\./)).toBeVisible();
    await postCard.getByRole('button', { name: 'Remove post' }).click();
    await confirmDialog(m.page, 'Remove this post?', 'Remove');
    await expectToast(m.page, 'Post removed.');
    await expect(postCard.getByText(/Members no longer see it\./)).toBeVisible();

    // Members no longer see either; the rest of the room is untouched.
    await r.page.goto(`/rooms/${roomId}`);
    await expect(r.page.getByRole('heading', { name: roomTitle })).toBeVisible();
    await expect(r.page.getByText(rude)).toHaveCount(0);
    await r.page.goto(boardUrl);
    await expect(r.page.getByRole('heading', { name: `🏘️ ${boardName}` })).toBeVisible();
    await expect(r.page.getByText(post)).toHaveCount(0);

    // Marking the report actioned takes it out of the queue.
    await messageCard.getByRole('button', { name: 'Mark actioned' }).click();
    await expect(reportCard(m.page, rudeReason)).toHaveCount(0);

    for (const person of [r, o, m]) await person.context.close();
  });

  test('a suspended person is told so at sign-in, and gets back in when it is lifted', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const reporter = await newAccount('safesrep', 'Sam Reporter');
    const author = await newAccount('safesus', 'Sid Suspended');
    const moderator = await newAccount('safesmod', 'Max Moderator');
    await appointModerator(moderator);
    const reason = unique('Threatening messages ');

    const r = await personPage(browser, reporter);
    await reportProfile(r.page, author, reason);

    const m = await personPage(browser, moderator);
    await m.page.goto('/moderation');
    await expect(reportCard(m.page, reason).getByText(`${reporter.name} reported ${author.name}`)).toBeVisible();
    await suspendFromQueue(m.page, reason, author);
    const suspended = m.page.locator('li', { hasText: `${author.name} is suspended` });
    await expect(suspended).toContainText('is suspended until');
    await expect(reportCard(m.page, reason).getByText(/^Suspended until/)).toBeVisible();

    // Signing in with the right password says what is true, and where to appeal.
    const visitor = await browser.newContext();
    const page = await visitor.newPage();
    await submitSignIn(page, author.handle, PASSWORD);
    const refusal = page.getByRole('alert').filter({ hasText: 'suspended' });
    await expect(refusal).toContainText('This account is suspended');
    await expect(refusal).toContainText('If you think this is a mistake, email');
    await expect(refusal).toContainText('SB-AUTH-SUSPENDED');
    await expect(page).toHaveURL(/\/login/);

    // The moderator lifts it after an appeal, and the same password works.
    await suspended.getByRole('button', { name: 'Lift suspension' }).click();
    await confirmDialog(m.page, `Lift ${author.name}’s suspension?`, 'Lift suspension');
    await expectToast(m.page, `${author.name} can sign in again.`);
    await expect(m.page.locator('li', { hasText: `${author.name} is suspended` })).toHaveCount(0);
    await submitSignIn(page, author.handle, PASSWORD);
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });

    for (const context of [r.context, m.context, visitor]) await context.close();
  });

  // GoTrue answers a banned user's /user call with 403 user_banned and no user;
  // the proxy has to read that as a suspension, not as being signed out.
  test('a suspended person still signed in is signed out to the suspension message on their next page', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const reporter = await newAccount('safelrep', 'Lou Reporter');
    const author = await newAccount('safelive', 'Liv Live');
    const moderator = await newAccount('safelmod', 'Mel Moderator');
    await appointModerator(moderator);
    const reason = unique('Harassing me ');

    const o = await personPage(browser, author);
    const r = await personPage(browser, reporter);
    await reportProfile(r.page, author, reason);
    const m = await personPage(browser, moderator);
    await m.page.goto('/moderation');
    await suspendFromQueue(m.page, reason, author);

    // Their tab is still open from before. The next page they open says why.
    await o.page.goto('/');
    await o.page.waitForURL(/\/login\?error=suspended/);
    await expect(o.page.getByText('This account is suspended, so it can’t be signed into.')).toBeVisible();
    await expect(o.page.getByText(/If you think this is a mistake, email/)).toBeVisible();

    for (const person of [o, r, m]) await person.context.close();
  });

  test('a block closes a match room for both people, and quiets a shared plan room', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    // Discovery is shared by every run, and lists people who share an
    // interest with you first, so these two share one nobody else has.
    const tag = unique('Safety ');
    const finder = await newAccount('safefind', `Finn ${tag}`);
    const found = await newAccount('safefound', `Fay ${tag}`);
    const third = await newAccount('safethird', `Tess ${tag}`);
    const interest = unique('origami');
    const admin = adminClient();
    await admin.from('profiles').update({ interests: [interest] }).eq('id', finder.id);
    await admin
      .from('profiles')
      .update({ discoverable: true, discovery_interests: true, interests: [interest] })
      .eq('id', found.id);

    // D13: browsing people needs you to be discoverable yourself.
    const f = await personPage(browser, finder);
    await f.page.goto('/discover');
    await expect(f.page.getByText('You are not discoverable.')).toBeVisible();
    await expect(f.page.getByRole('link', { name: found.name, exact: true })).toHaveCount(0);
    await f.page.getByRole('switch', { name: 'Show me in people discovery' }).click();
    await expectToast(f.page, 'You are discoverable now.');

    // G5: the card links to their profile, and they can be marked "Interested".
    const card = f.page.locator('div', { has: f.page.getByRole('link', { name: found.name, exact: true }) }).filter({ has: f.page.getByRole('button', { name: 'Interested' }) }).last();
    await expect(card.getByRole('button', { name: 'Block' })).toBeVisible();
    await card.getByRole('link', { name: found.name, exact: true }).click();
    await f.page.waitForURL(new RegExp(`/u/${found.handle}`));
    await expect(f.page.getByText(`@${found.handle}`).first()).toBeVisible();
    await f.page.goBack();
    await card.getByRole('button', { name: 'Interested' }).click();
    await expectToast(f.page, 'Saved privately. Nothing is sent unless it’s mutual.');

    // They pick the finder back, and it is mutual: a private room opens.
    const g = await personPage(browser, found);
    await g.page.goto('/discover');
    const back = g.page.locator('div', { has: g.page.getByRole('link', { name: finder.name, exact: true }) }).filter({ has: g.page.getByRole('button', { name: 'Interested' }) }).last();
    await back.getByRole('button', { name: 'Interested' }).click();
    await expectToast(g.page, 'It is mutual.');
    await g.page.getByRole('button', { name: 'Say hi' }).first().click();
    await g.page.waitForURL(/\/rooms\/[0-9a-f-]{36}/);
    const matchRoom = g.page.url();
    const hello = unique('Hi there ');
    await sendInRoom(g.page, hello);

    // G1: the finder blocks them from the room. It becomes read-only for both.
    await f.page.goto(matchRoom);
    await expect(f.page.getByText(hello)).toBeVisible();
    await f.page.getByRole('button', { name: `Options for ${found.name}` }).first().click();
    await f.page.getByRole('button', { name: 'Block', exact: true }).click();
    await confirmDialog(f.page, `Block ${found.name}?`, 'Block');
    await expectToast(f.page, `${found.name} is blocked.`);
    await expect(f.page.getByRole('status').filter({ hasText: `You blocked ${found.name}` })).toContainText(
      'this conversation is read-only for both of you',
    );
    await expect(f.page.getByLabel('Message', { exact: true })).toHaveCount(0);
    await expect(f.page.getByText(hello)).toBeVisible();

    await g.page.reload();
    await expect(g.page.getByLabel('Message', { exact: true })).toHaveCount(0);
    const theirNotice = g.page.getByRole('status').filter({ hasText: 'read-only' });
    await expect(theirNotice).toBeVisible();
    // It never tells the blocked person who did it.
    await expect(theirNotice).not.toContainText('blocked');
    await expect(g.page.getByText(hello)).toBeVisible();

    // Neither finds the other in discovery any more.
    await g.page.goto('/discover');
    await expect(g.page.getByRole('link', { name: finder.name, exact: true })).toHaveCount(0);

    // D12: in a plan's room the blocked person can still write to the group,
    // but the person who blocked them is not notified about it.
    const planRoomTitle = unique('Group dinner ');
    const planRoom = await sharedPlanRoom(planRoomTitle, [finder, found, third]);
    await g.page.goto(`/rooms/${planRoom}`);
    const toGroup = unique('Running late ');
    await sendInRoom(g.page, toGroup);

    const t = await personPage(browser, third);
    await expect.poll(() => notificationsSay(t.page), { timeout: 20_000 }).toContain(`New message in ${planRoomTitle}`);
    expect(await notificationsSay(f.page)).not.toContain(planRoomTitle);
    await f.page.goto(`/rooms/${planRoom}`);
    await expect(f.page.getByText(toGroup)).toBeVisible();
    await expect(f.page.getByLabel('Message', { exact: true })).toBeVisible();

    for (const person of [f, g, t]) await person.context.close();
  });

  test('giving someone space takes them off the reconnection radar, and the list lets you stop', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const me = await newAccount('safespace', 'Gail Giver');
    const avoided = await newAccount('safeavoid', 'Vic Avoided');
    const other = await newAccount('safeold', 'Olly Oldfriend');
    // Two friendships three months old with nothing shared since: the radar's case.
    await befriend(me, avoided, 90);
    await befriend(me, other, 90);

    const a = await personPage(browser, me);
    await a.page.goto('/');
    const radar = a.page.locator('section', { has: a.page.getByText('It’s been a while') });
    await expect(radar.getByText(avoided.name)).toBeVisible();
    await expect(radar.getByText(other.name)).toBeVisible();

    // Give space from their profile.
    await a.page.goto(`/u/${avoided.handle}`);
    await a.page.getByRole('button', { name: 'Give space' }).click();
    const giving = a.page.getByRole('button', { name: 'Giving space' });
    await expect(giving).toHaveAttribute('aria-pressed', 'true');
    // The button answers at once; it is enabled again once the server has it.
    await expect(giving).toBeEnabled();

    // G8: the radar no longer suggests them.
    await a.page.goto('/');
    await expect(radar.getByText(other.name)).toBeVisible();
    await expect(radar.getByText(avoided.name)).toHaveCount(0);

    // G35: everyone you give space to is listed in People, with a way to stop.
    await a.page.goto('/people');
    const list = a.page.locator('section', { has: a.page.getByRole('heading', { name: 'Giving space' }) });
    const row = list.locator('li', { hasText: avoided.name });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Stop giving space' }).click();
    await expectToast(a.page, `You’re no longer giving ${avoided.name.split(' ')[0]} space.`);
    await expect(a.page.getByRole('heading', { name: 'Giving space' })).toHaveCount(0);

    await a.page.goto('/');
    await expect(radar.getByText(avoided.name)).toBeVisible();
    await a.context.close();
  });

  test('a sabbatical note shows on the profile and in the invite picker, and the invitation waits in the inbox', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const resting = await newAccount('safesabb', 'Sage Resting');
    const host = await newAccount('safehost', 'Hal Host');
    await befriend(host, resting);
    const note = unique('Back in spring, writing a book ');

    const s = await personPage(browser, resting);
    await s.page.goto('/settings');
    const section = s.page.locator('section', { has: s.page.getByText('Take a quiet season') });
    await section.getByRole('checkbox').check();
    await section.getByLabel('Sabbatical note').fill(note);
    await s.page.getByRole('button', { name: 'Save changes' }).click();
    await expect(s.page.getByText('Changes saved.')).toBeVisible();
    // Settings says what a friend will see and what happens to an invitation.
    await expect(section).toContainText('Friends can still invite you');
    await expect(section).toContainText('the invitation waits in your inbox');

    // D6: the note is on their public profile…
    const h = await personPage(browser, host);
    await h.page.goto(`/u/${resting.handle}`);
    await expect(h.page.getByText(`${resting.name} is on sabbatical`)).toBeVisible();
    await expect(h.page.getByText(`“${note}”`)).toBeVisible();

    // …and in the invite picker, where picking them explains what happens.
    const title = unique('Quiet dinner ');
    await sendPlan(h.page, title, async (page) => {
      const pick = page.getByRole('button', { name: new RegExp(resting.name) });
      await expect(pick).toContainText('🍃 On sabbatical');
      await pick.click();
      await expect(page.getByText(`${resting.name} is on sabbatical`)).toBeVisible();
      await expect(page.getByText(`“${note}”`)).toBeVisible();
      await expect(page.getByText('Your invitation will wait in their inbox without a notification')).toBeVisible();
    });

    // The invitation is waiting for them in the inbox.
    await expect.poll(() => notificationsSay(s.page), { timeout: 20_000 }).toContain(title);

    for (const person of [s, h]) await person.context.close();
  });
});
