import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

type Cookies = Awaited<ReturnType<BrowserContext['cookies']>>;

/**
 * Sign-in is rate-limited at 8 attempts per identifier per 10 minutes
 * (`signin:<identifier>`, src/lib/actions/auth.ts) — a real protection this
 * suite was walking straight into. Nine journeys sign in as e2ehost, so the
 * ninth got SB-RATE-LIMIT instead of a session, and the tests were spending
 * a user-facing budget on setup.
 *
 * The form is therefore driven once per identifier and the session cookies are
 * reused for the rest of the run. "a seeded user can sign in" is still a real
 * sign-in — it runs first and fills this cache — and every other journey starts
 * already signed in, which is all any of them ever wanted.
 */
const sessionCookies = new Map<string, Cookies>();

async function login(page: Page, identifier: string) {
  const cached = sessionCookies.get(identifier);
  if (cached) {
    await page.context().addCookies(cached);
    if (await signedInAs(page, identifier)) {
      // A silent token refresh during signedInAs may have rotated the cookies.
      // Re-capture so later contexts get the current tokens, not the stale ones.
      sessionCookies.set(identifier, await page.context().cookies());
      return;
    }
    // Whatever that session was, it isn't this person — expired, rejected, or
    // the wrong account entirely. Say so and sign in properly, rather than
    // running a journey as someone else and failing somewhere unrelated.
    console.log(`[e2e] reused session for ${identifier} did not hold; signing in again`);
    sessionCookies.delete(identifier);
    // The rejected cache entry is still installed in this browser context.
    // Without clearing it, /login can immediately redirect the browser back to
    // the signed-in home page, leaving signIn waiting for a form that can never
    // appear. A fresh credential check needs a genuinely signed-out context.
    await page.context().clearCookies();
  }

  await signIn(page, identifier);
  sessionCookies.set(identifier, await page.context().cookies());

  // The browser must be holding the person we asked for. Every journey below
  // assumes it, and nothing downstream says so when it isn't true.
  expect(
    await signedInAs(page, identifier),
    `signed in as "${identifier}" but the app does not show that account`,
  ).toBe(true);
}

/** Does the app itself agree this browser is @identifier? */
async function signedInAs(page: Page, identifier: string): Promise<boolean> {
  await page.goto('/profile');
  try {
    // `expect` rather than `isVisible()`, which does not wait — a signed-out
    // browser is redirected to /welcome, and this has to tell that apart from
    // a page that simply hasn't painted yet.
    await expect(
      page.getByText(`@${identifier}`, { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function signIn(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByPlaceholder('email or username').fill(identifier);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  // The page has a "Sign in" mode-toggle tab as well as the form's submit
  // button, both named "Sign in" — scope to the form to click the submit.
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 30_000,
    });
  } catch {
    // Still on /login means the form refused and said why — wrong credentials,
    // an unconfirmed account, a rate limit — each with its own SB- code (see
    // docs/AUTH.md). Quote it. "Navigation timeout" describes the symptom and
    // names nothing; the code on screen names the cause.
    throw new Error(
      `Sign-in as "${identifier}" never left /login. The page said: ${
        (await pageComplaints(page)) || 'nothing — no error was shown'
      }`,
    );
  }
}

/** Visible alert text, normalised — what the app is objecting to right now. */
async function pageComplaints(page: Page): Promise<string> {
  const alerts = (await page.getByRole('alert').allInnerTexts())
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return alerts.join(' | ');
}

/**
 * Start recording what the browser itself complains about.
 *
 * An action that *throws* rather than returning `{ ok: false }` never reaches
 * the `setError` that renders a `role="alert"`, so the screen stays silent and
 * `pageComplaints` has nothing to quote. The rejection still surfaces here.
 * Call before the interaction; read the returned function afterwards.
 */
function browserNoise(page: Page): () => string {
  const lines: string[] = [];
  page.on('pageerror', (error) => lines.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') lines.push(`console.error: ${message.text()}`);
  });
  return () => lines.join(' | ');
}

/**
 * Record what the page asks the server for, and what it gets back.
 *
 * The remaining question about the poll suggestion is whether `router.refresh()`
 * refetches at all. "The write landed but the page never showed it" has two
 * causes that look identical on screen — no refetch was made, or one was made
 * and came back without the new row (or as a redirect) — and only the traffic
 * tells them apart. A server action POST and an RSC refetch both go to the page
 * URL; the `RSC` header is what distinguishes them.
 */
function pageTraffic(page: Page, match: RegExp): () => string {
  const lines: string[] = [];
  page.on('response', (response) => {
    const request = response.request();
    if (!match.test(response.url())) return;
    const headers = request.headers();
    const kind =
      request.method() === 'POST'
        ? headers['next-action']
          ? 'server action'
          : 'POST'
        : headers['rsc'] || headers['next-router-state-tree']
          ? 'RSC refetch'
          : 'document';
    lines.push(`${kind} → ${response.status()}`);
  });
  return () => (lines.length ? lines.join(', ') : 'nothing');
}

/**
 * What the group-decision screen is showing, in the terms that tell apart the
 * ways an idea can fail to land.
 *
 * The discriminator is the suggestion box. `PollSection.submitSuggestion`
 * clears it **synchronously**, before it awaits anything — so a box still
 * holding what was typed means the submit handler never ran at all (the click
 * missed, the form never submitted, the button re-rendered out from under it),
 * while an empty box means the handler ran and whatever went wrong went wrong
 * after that. Without this, both report the same "it isn't on the page".
 */
async function pollScreen(page: Page) {
  const box = page.getByRole('textbox', { name: 'Suggest an idea' });
  const add = page.getByRole('button', { name: 'Add', exact: true }).first();
  const boxes = await box.count();
  return {
    suggestBoxPresent: boxes > 0,
    stillTyped: boxes > 0 ? await box.inputValue() : null,
    addButtons: await page.getByRole('button', { name: 'Add', exact: true }).count(),
    addEnabled: (await add.count()) > 0 ? await add.isEnabled() : false,
    // Every option renders its rating buttons inside `aria-label="Rate <label>"`,
    // so this is the list the group can actually see and vote on.
    options: await page
      .locator('[aria-label^="Rate "]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('aria-label')?.replace(/^Rate /, '') ?? ''),
      ),
    url: page.url(),
  };
}

/**
 * Open the wizard with everything the product requires before a plan may leave
 * the Basics step: a title, **and** at least a location or a detail
 * (`hasInviteDetails`, src/lib/event-details.ts — the "require context before
 * sending invitations" rule).
 *
 * A fixture that fills only the title doesn't fail where the rule lives. Next
 * simply stays disabled, and the suite reports five unrelated-looking
 * "expected enabled, received disabled" failures on a helper three frames away
 * from the cause. That is exactly how these tests went red and stayed red.
 *
 * The detail is filled rather than the location because the location field runs
 * a debounced place search on every keystroke: same gate, no moving parts.
 */
async function startPlan(page: Page, title: string) {
  await page.goto('/events/new');
  await page.getByPlaceholder(TITLE).fill(title);
  await page
    .getByLabel('Details', { exact: true })
    .fill('Seeded by the authenticated e2e suite.');

  // Assert the gate here, where it can name itself. If Basics ever grows
  // another requirement, this line fails saying the fixture is short of what
  // the wizard now asks for — instead of every journey timing out downstream.
  await expect(
    page.getByRole('button', { name: 'Next', exact: true }),
    'The wizard would not leave Basics with a title and a detail — it has a new requirement this fixture does not satisfy',
  ).toBeEnabled({ timeout: 5_000 });
}

async function currentWizardStep(page: Page) {
  const text = await page.getByText(/Step \d+ of \d+/).textContent();
  const match = text?.match(/Step (\d+) of (\d+)/);
  if (!match) throw new Error(`Could not read wizard step from "${text}"`);
  return { current: Number(match[1]), total: Number(match[2]) };
}

async function clickWizardNext(page: Page) {
  const { current, total } = await currentWizardStep(page);
  const next = page.getByRole('button', { name: 'Next', exact: true });
  // A disabled Next means this step's requirements aren't met. Name the step
  // and quote whatever the wizard is objecting to, so the report reads as
  // "the plan is missing something" rather than "a button was disabled".
  await expect(
    next,
    `Wizard step ${current} of ${total} would not advance. On screen: ${
      (await pageComplaints(page)) || 'no validation message shown'
    }`,
  ).toBeEnabled({ timeout: 5_000 });
  await next.click();
  await expect(page.getByText(`Step ${current + 1} of ${total}`)).toBeVisible({
    timeout: 5_000,
  });
}

async function reachWizardReview(
  page: Page,
  prepareStep?: (step: number) => Promise<void>,
) {
  for (let i = 0; i < 6; i += 1) {
    const { current, total } = await currentWizardStep(page);
    if (current === total) return;
    await prepareStep?.(current);
    await clickWizardNext(page);
  }

  throw new Error('Wizard did not reach the review step');
}

test.describe('authenticated surface', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'authenticated journeys run against the desktop app shell');

  test('a seeded user can sign in and reach an authenticated page', async ({ page }) => {
    await login(page, 'e2ehost');
    // Landed somewhere inside the app (home/onboarding), not bounced to welcome.
    await expect(page).not.toHaveURL(/\/welcome/);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  });

  test('a signed-in user can download a valid JSON data export', async ({ page }) => {
    await login(page, 'e2ehost');
    await page.goto('/settings');

    const downloadStarted = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON' }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toMatch(
      /^switchboard-data-\d{4}-\d{2}-\d{2}\.json$/,
    );

    const path = await download.path();
    expect(path, 'browser did not persist the exported file').not.toBeNull();
    const parsed = JSON.parse(await readFile(path!, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(parsed).toMatchObject({ schemaVersion: 1 });
    expect(parsed).toHaveProperty('profile');
    expect(parsed).toHaveProperty('plans');
    expect(parsed).toHaveProperty('rsvps');
    expect(parsed).toHaveProperty('messages');
    expect(parsed).toHaveProperty('signals');
  });

  test('turning on an availability signal never asks for location', async ({ page }) => {
    await page.addInitScript(() => {
      const calls = { geolocation: 0, permissions: 0 };
      Object.defineProperty(window, '__signalLocationCalls', {
        configurable: true,
        value: calls,
      });
      Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
        configurable: true,
        value: () => {
          calls.geolocation += 1;
        },
      });
      Object.defineProperty(navigator.permissions, 'query', {
        configurable: true,
        value: async () => {
          calls.permissions += 1;
          return { state: 'prompt' };
        },
      });
    });

    await login(page, 'e2ehost');
    await page.goto('/');
    // The composer's status chips. A live signal adds "Turn off …" and
    // "Change who sees …" buttons that carry the same words, so the chip is
    // found inside its own group rather than by name alone.
    const signal = page
      .getByRole('group', { name: 'Statuses' })
      .getByRole('button', { name: /Down to Hang/ });
    await expect(signal).toBeVisible();

    // Tapping a chip only drafts it (nothing is live until Turn on), so start
    // from an unselected chip even if a prior interaction left it lit.
    if ((await signal.getAttribute('aria-pressed')) === 'true') {
      await signal.click();
      await expect(signal).toHaveAttribute('aria-pressed', 'false');
    }
    await page.evaluate(() => {
      const calls = (window as typeof window & {
        __signalLocationCalls: { geolocation: number; permissions: number };
      }).__signalLocationCalls;
      calls.geolocation = 0;
      calls.permissions = 0;
    });

    await signal.click();

    const calls = await page.evaluate(
      () => (window as typeof window & {
        __signalLocationCalls: { geolocation: number; permissions: number };
      }).__signalLocationCalls,
    );
    expect(calls).toEqual({ geolocation: 0, permissions: 0 });
  });

  test('the feature index is reachable, searchable, and its links work', async ({
    page,
  }) => {
    await login(page, 'e2ehost');
    await page.goto('/features');
    // `exact` matters here: accessible-name matching is substring by default,
    // and the index itself lists "Everything you’re part of" and "Everything
    // updates live", so the loose name resolves to three headings.
    await expect(
      page.getByRole('heading', { name: 'Everything', exact: true }),
    ).toBeVisible();

    // Searching by what a feature does, not what it's called — the whole point
    // of indexing the blurbs — narrows to the one card.
    await page.getByLabel('Search features').fill('who owes what');
    await expect(page.getByRole('link', { name: /Split the bill/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cascading invites/ })).toBeHidden();

    // And an indexed destination actually goes there (src/lib/features.test.ts
    // proves every href resolves; this proves the rendered card navigates).
    await page.getByLabel('Clear search').click();
    await page.getByRole('link', { name: /Your people/ }).click();
    await expect(page).toHaveURL(/\/people/);
  });

  test('a signed-in user can open the new-plan wizard', async ({ page }) => {
    await login(page, 'e2ehost');
    await page.goto('/events/new');
    await expect(page.getByPlaceholder(TITLE)).toBeVisible();
  });

  test('going back in the wizard keeps the draft — by button, by segment, by gesture', async ({
    page,
  }) => {
    // The complaint this covers: "let me change something from a previous page
    // without starting over". Every route back has to land on the earlier step
    // with the plan still in it — including the phone's back gesture, which
    // used to leave /events/new entirely and take the whole draft with it.
    await login(page, 'e2ehost');
    await startPlan(page, 'E2E back navigation');

    const title = page.getByPlaceholder(TITLE);
    await clickWizardNext(page);
    // People is the second step and needs someone on the list before it lets
    // go. One friend, invited everyone-at-once (the default), makes a
    // five-step plan: there is no order to set for one person.
    await page.getByRole('button', { name: /E2E Guest/ }).click();
    await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
    await clickWizardNext(page);
    await expect(page.getByText('Step 3 of 5')).toBeVisible();

    // 1. The Back button.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText('Step 2 of 5')).toBeVisible();

    // 2. The browser/phone back gesture — one step, not out of the wizard.
    await page.goBack();
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await expect(page).toHaveURL(/\/events\/new/);
    await expect(title).toHaveValue('E2E back navigation');

    // 3. A progress segment, jumping more than one step at a time.
    await clickWizardNext(page);
    await clickWizardNext(page);
    await expect(page.getByText('Step 3 of 5')).toBeVisible();
    await page.getByRole('button', { name: 'Step 1, Basics' }).click();
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await expect(title).toHaveValue('E2E back navigation');

    // Editing after going back is the point of going back.
    await title.fill('E2E back navigation, revised');
    await clickWizardNext(page);
    await page.goBack();
    await expect(title).toHaveValue('E2E back navigation, revised');
  });

  test('a host can create a plan with a guest and land on the event page', async ({ page }) => {
    await login(page, 'e2ehost');
    await startPlan(page, 'E2E guest plan');

    // Walk the wizard: add a token guest when that step appears, otherwise
    // advance, until the final submit button shows, then send.
    const submit = page.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    await reachWizardReview(page, async (step) => {
      if (step === 2) {
        const guestName = page.getByPlaceholder('Name (optional)');
        await guestName.fill('Casey Guest');
        await page.getByPlaceholder('@username, email, or phone').fill('casey@example.com');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });

    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    // The event route streams its loading shell while the plan data resolves.
    // waitForURL's default waits for the document's full `load` event, which
    // can outlive the navigation we are asserting. The heading below is
    // the real readiness check; here we only need to prove the redirect landed.
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'E2E guest plan', level: 1 })).toBeVisible();
  });

  // ——— Golden journey 1: create → cascade → accept ———
  test('a host invites a friend and the friend accepts', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await login(host, 'e2ehost');
    await startPlan(host, 'Cascade journey plan');

    const submit = host.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    await reachWizardReview(host, async (step) => {
      // People step: pick the seeded friend as a real member.
      if (step === 2) {
        await host.getByRole('button', { name: /E2E Guest/ }).click();
        await expect(host.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });
    await expect(submit).toBeVisible({ timeout: 5_000 });
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
    const noise = browserNoise(page);
    await login(page, 'e2ehost');
    await startPlan(page, 'Poll journey plan');

    const submit = page.getByRole('button', {
      name: /Create & start deciding|Send invitations/,
    });
    await reachWizardReview(page, async (step) => {
      // People step first, then the invites step: turn on "let the group decide".
      if (step === 2) {
        await page.getByRole('button', { name: /E2E Guest/ }).click();
        await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
      if (step === 3) await page.getByText('Let the group decide what to do 🗳️').click();
    });
    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const traffic = pageTraffic(page, /\/events\/[0-9a-f-]{36}/);

    // Reload before touching anything, for the reason "a host invites a
    // connection directly" already documents: the cookies this page will send
    // on the next server action can still carry the access token from before
    // `createEvent` rotated them. That POST then comes back as a redirect
    // rather than a result, the action's promise rejects, and — until the
    // `catch` added to PollSection — the screen said nothing at all.
    //
    // This journey was missing the same guard its sibling has, which is why it
    // failed intermittently and silently: box cleared, list unchanged, no
    // objection, nothing written.
    await page.reload();
    await page.waitForLoadState('networkidle');

    // The poll renders on the event page in the deciding phase.
    await page.getByRole('textbox', { name: 'Suggest an idea' }).fill('Tacos');
    await page.getByRole('button', { name: 'Add', exact: true }).first().click();

    // Report what the screen is doing, not just that a string is absent.
    //
    // "the suggestion never appeared" is true of every way this can break and
    // names none of them, which is how this failure survived a round trip of
    // its own. The four facts below separate them: whether the app objected,
    // whether the submit handler ran at all (the box clears synchronously),
    // what the group can actually see, and whether the browser threw. An
    // action that throws instead of returning `{ ok: false }` renders no alert,
    // so the silent-screen case needs the browser's own log to be readable.
    try {
      await expect(async () => {
        if (await page.getByText('Tacos').first().isVisible()) return;
        const screen = await pollScreen(page);
        const complaint = await pageComplaints(page);
        const browser = noise();
        throw new Error(
          [
            `"Tacos" is not on the group-decision screen (${screen.url}).`,
            complaint ? `The app objected: ${complaint}` : 'The app objected to nothing.',
            !screen.suggestBoxPresent
              ? 'There is no suggestion box — either no poll rendered, or it is not open to suggestions.'
              : screen.stillTyped
                ? `The box still holds "${screen.stillTyped}". PollSection clears it synchronously on submit, so the submit handler never ran — the click did not reach it. (Add buttons on page: ${screen.addButtons}, first one enabled: ${screen.addEnabled}.)`
                : 'The box is empty, so the submit handler did run. The idea was lost after that — in the action, or in the re-render that should have shown it.',
            `Options the group can see: ${
              screen.options.length ? screen.options.join(', ') : 'none'
            }`,
            browser ? `The browser logged: ${browser}` : 'The browser logged nothing.',
            `Traffic to the plan URL since it loaded: ${traffic()}`,
          ].join('\n'),
        );
      }).toPass({ timeout: 15_000 });
    } catch (failure) {
      // Ask the server the one question the screen cannot answer: was the row
      // ever written? A reload re-renders the plan from the database with no
      // client state involved, which splits the two remaining causes cleanly —
      // a write that never happened, or a write that happened and never made
      // it back onto the page.
      await page.reload();
      const written = await page
        .getByText('Tacos')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      throw new Error(
        `${(failure as Error).message}\nAfter a full reload: ${
          written
            ? 'it IS there. The suggestion was saved and the page never re-rendered to show it.'
            : 'still absent. The suggestion was never saved, even though the action reported no error.'
        }`,
      );
    }
    await page.getByRole('button', { name: 'Absolutely love this' }).first().click();
  });

  // ——— Reaching one person on a plan ———
  //
  // The two halves of "tap a profile, contact them": someone with no account,
  // who can only be reached off-platform from what the host typed, and someone
  // who has one, who gets the invitation in the app.

  test('a host can email a guest invitee straight from the plan', async ({ page }) => {
    await login(page, 'e2ehost');
    await startPlan(page, 'Guest contact plan');

    const submit = page.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    await reachWizardReview(page, async (step) => {
      if (step === 2) {
        await page.getByPlaceholder('Name (optional)').fill('Casey Guest');
        await page.getByPlaceholder('@username, email, or phone').fill('casey@example.com');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });
    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    // This route streams a loading shell, so assert the committed redirect and
    // let the contact button below prove the plan itself is ready.
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });

    // Tap them in the invitation flow: their card opens with the address the
    // host typed and a one-tap mail action.
    await page.getByRole('button', { name: /Contact Casey Guest/ }).click();
    await expect(page.getByText('casey@example.com').first()).toBeVisible({
      timeout: 5_000,
    });

    const send = page.getByRole('link', { name: 'Email' });
    await expect(send).toBeVisible();
    const href = (await send.getAttribute('href')) ?? '';
    expect(href.startsWith('mailto:casey%40example.com?')).toBe(true);
    // The prefilled body carries a real, absolute link to the plan — the whole
    // point of sending from here rather than from the phone's contact list.
    expect(decodeURIComponent(href)).toMatch(/https?:\/\/[^\s]+\/(rsvp|i)\//);
  });

  test('a host invites a connection directly and it arrives in the app', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    await login(host, 'e2ehost');
    await startPlan(host, 'Direct invite plan');

    // Start the plan with a guest, so the seeded friend is still un-invited and
    // therefore offered in the add-people panel.
    const submit = host.getByRole('button', {
      name: /Send invitations|Create & start deciding/,
    });
    await reachWizardReview(host, async (step) => {
      if (step === 2) {
        await host.getByPlaceholder('Name (optional)').fill('Casey Guest');
        await host.getByPlaceholder('@username, email, or phone').fill('casey@example.com');
        await host.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(host.getByText('1 person selected')).toBeVisible({ timeout: 5_000 });
      }
    });
    await expect(submit).toBeVisible({ timeout: 5_000 });
    await submit.click();
    await host.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 15_000 });
    const eventUrl = host.url();

    // Reload so the server action runs against the same session the page sees.
    // Without this, the cookies the browser sends on the POST can carry a stale
    // access token from before the createEvent action rotated them — and the
    // server action's getUser() then resolves to a different (or no) session.
    await host.reload();
    await host.waitForLoadState('networkidle');

    // Tap the friend in "From your people" and ask them now, ahead of the line.
    await host.getByRole('button', { name: /Open E2E Guest/ }).click();
    await host.getByRole('button', { name: 'Send invite now' }).click();
    // The toast is the app's own account of what happened, and it auto-dismisses
    // — so read it once it lands and assert on the captured text. A refusal
    // ("…is already on this plan", "This plan is already full") then reports
    // what the app said instead of "element not found".
    const toasts = host.getByRole('status', { name: 'Notifications' });
    await expect(toasts).not.toBeEmpty({ timeout: 15_000 });
    const said = (await toasts.innerText()).replace(/\s+/g, ' ').trim();
    expect(said, 'the app reported something else after "Send invite now"').toContain(
      'Invitation sent to E2E Guest',
    );

    // It is a real, live invite: the friend can answer it without any link
    // being sent to them.
    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    await login(guest, 'e2eguest');
    await guest.goto(eventUrl);
    await guest.getByRole('button', { name: /I.?m in/ }).click();
    await expect(guest.getByText(/You.?re in/)).toBeVisible({ timeout: 15_000 });

    await hostCtx.close();
    await guestCtx.close();
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
  test('notification channel choice persists without opting into SMS', async ({ page }) => {
    await login(page, 'e2eguest');
    await page.goto('/settings');
    const routes = page.getByRole('heading', { name: 'How plan alerts reach you', exact: true }).locator('..');
    // Channels are committed by the shared Settings save bar, like every other
    // choice on the page (completion plan G49).
    const saveBar = page.getByRole('region', { name: 'Unsaved settings changes' });
    await routes.getByRole('combobox').first().selectOption('in_app');
    await saveBar.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(routes.getByRole('combobox').first()).toHaveValue('in_app');
    await expect(page.getByLabel('I agree to receive these text messages.', { exact: true })).not.toBeChecked();
    await routes.getByRole('combobox').first().selectOption('existing');
    await saveBar.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  });

});
