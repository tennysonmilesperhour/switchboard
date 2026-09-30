import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  adminClient,
  DB,
  linkIn,
  login,
  pageComplaints,
  requireMailRelay,
  runCascadeSweep,
  unique,
  waitForMail,
} from './support';

/**
 * What happens to a plan after it is sent: a response window running out and
 * the invitation moving on, a group decision closing at its deadline, and a
 * co-host running the plan alongside the host.
 *
 * The first two depend on time passing. Rather than wait, the service role
 * moves the one deadline involved into the past, and then the real minute
 * sweep (`/api/cron/cascade`, called with the CRON_SECRET the app was started
 * with) does what it does every minute in production. The deadline is the only
 * thing arranged; the sweep, and everything a person sees afterwards, is real.
 *
 * Fixture users come from e2e/seed.mjs (e2ehost, e2eguest; accepted friends).
 */

const TITLE_PLACEHOLDER = 'Coffee downtown, Game night, Saturday hike…';
type StepLabel = 'Basics' | 'People' | 'Invites' | 'Order' | 'Privacy' | 'Review';

/** The wizard step on screen, by name ("People"), from the progress bar. */
async function currentStep(page: Page): Promise<StepLabel> {
  const current = page.getByRole('list', { name: 'Steps' }).locator('[aria-current="step"]');
  const label = (await current.getAttribute('aria-label')) ?? '';
  const match = label.match(/^Step \d+, (.+)$/);
  if (!match) throw new Error(`Could not read the wizard step from "${label}"`);
  return match[1] as StepLabel;
}

/**
 * Walk the wizard to Review, running a step's preparation when it appears, and
 * send. Steps are found by name because the list itself changes with the plan
 * ("Order" only exists for a line of more than one person).
 */
async function createPlan(
  page: Page,
  title: string,
  prepare: Partial<Record<StepLabel, (page: Page) => Promise<void>>>,
): Promise<string> {
  await page.goto('/events/new');
  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title);
  await page.getByLabel('Details', { exact: true }).fill('Seeded by the plan-lifecycle e2e suite.');
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
  await page.getByRole('button', { name: /Send invitations|Create & start deciding/ }).click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 45_000 });
  return page.url();
}

async function pickFriend(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name) }).click();
}

async function addGuest(page: Page, name: string, contact: string) {
  await page.getByPlaceholder('Name (optional)').fill(name);
  await page.getByPlaceholder('@username, email, or phone').fill(contact);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

function eventIdOf(url: string): string {
  return url.match(/\/events\/([0-9a-f-]{36})/)![1];
}

/** A `datetime-local` value `days` from now, at 6pm local. */
function localDateTime(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T18:00`;
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

test.describe('plan lifecycle', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'host journeys run against the desktop app shell');

  test('when a response window runs out, the next person in line is invited', async ({
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    requireMailRelay();
    const title = unique('Cascade window ');
    const nextEmail = `${unique('casey')}@example.com`;

    // A one-at-a-time plan: the seeded friend first, then a guest by email.
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();
    await login(host, 'e2ehost');
    const eventUrl = await createPlan(host, title, {
      People: async (page) => {
        await pickFriend(page, 'E2E Guest');
        await addGuest(page, 'Casey Next', nextEmail);
        await expect(page.getByText('2 people selected')).toBeVisible();
      },
      Invites: async (page) => {
        await page.getByRole('button', { name: /One at a time/ }).click();
      },
    });
    const eventId = eventIdOf(eventUrl);

    const invites = async () => {
      const { data, error } = await adminClient()
        .from('invites')
        .select('id, status, position, invitee_id, guest_contact, sent_at, window_minutes')
        .eq('event_id', eventId)
        .order('position');
      if (error) throw error;
      return data;
    };
    const [first, second] = await invites();
    expect(first.invitee_id, 'the friend should be first in line').not.toBeNull();
    expect(first.status).toBe('sent');
    expect(second.guest_contact).toBe(nextEmail);
    expect(second.status).toBe('queued');

    // Opening the plan also advances its line, so nobody has it open while its
    // window is moved — the sweep has to be what moves it on.
    await hostContext.close();

    const lapsed = new Date(Date.now() - (first.window_minutes + 5) * 60_000).toISOString();
    const { error: backdateError } = await adminClient()
      .from('invites')
      .update({ sent_at: lapsed })
      .eq('id', first.id);
    expect(backdateError, backdateError?.message).toBeNull();

    await runCascadeSweep(request);

    const after = await invites();
    expect(after.map((invite) => invite.status)).toEqual(['expired', 'sent']);
    expect(Date.parse(after[1].sent_at!)).toBeGreaterThan(Date.parse(lapsed));

    // The next person really is invited: the email reaches them, with their own
    // link to the plan.
    const mail = await waitForMail(nextEmail, `You are invited: ${title}`);
    expect(linkIn(mail, '/rsvp/')).toMatch(/\/rsvp\/[0-9a-f-]{36}$/);

    // And the host's view of the line says what happened.
    await asPerson(browser, 'e2ehost', async (page) => {
      await page.goto(eventUrl);
      const out = page.getByRole('list', { name: 'Invitations already out' });
      await expect(out.getByRole('listitem').filter({ hasText: 'E2E Guest' })).toContainText(
        'No response',
      );
      await expect(out.getByRole('listitem').filter({ hasText: 'Casey Next' })).toContainText(
        'Invited - waiting',
      );
    });
  });

  test('a group decision closes itself at its deadline and shows the winner', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const title = unique('Poll deadline ');
    const winner = unique('Tacos ');
    const other = unique('Sushi ');

    await login(page, 'e2ehost');
    const eventUrl = await createPlan(page, title, {
      People: async (wizard) => {
        await pickFriend(wizard, 'E2E Guest');
        await expect(wizard.getByText('1 person selected')).toBeVisible();
      },
      Invites: async (wizard) => {
        await wizard.getByText('Let the group decide what to do 🗳️').click();
        for (const idea of [winner, other]) {
          await wizard.getByPlaceholder('An idea, a place, or a time').fill(idea);
          await wizard.getByRole('button', { name: 'Add', exact: true }).click();
        }
        await expect(wizard.getByRole('list', { name: 'Options to start with' })).toContainText(
          other,
        );
        await wizard.getByRole('button', { name: 'Auto-pick the winner' }).click();
        // The host sets a real closing time; the test later lets it pass.
        await wizard.locator('#voteDeadline').fill(localDateTime(2));
      },
    });
    const eventId = eventIdOf(eventUrl);

    // See "a host opens a group decision" in authed.spec.ts: the first action
    // after createEvent can carry pre-rotation cookies, so start from a reload.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Voting closes/)).toBeVisible();

    const { data: poll, error: pollError } = await adminClient()
      .from('polls')
      .select('id, phase, vote_deadline, resolution')
      .eq('event_id', eventId)
      .single();
    expect(pollError, pollError?.message).toBeNull();
    expect(poll!.resolution).toBe('auto');
    expect(poll!.vote_deadline, 'the wizard did not save the closing time').not.toBeNull();

    const love = page
      .getByRole('group', { name: `Rate ${winner}` })
      .getByRole('button', { name: 'Absolutely love this' });
    await love.click();
    await expect(love).toHaveAttribute('aria-pressed', 'true');
    // The vote is optimistic on screen; wait for it to be saved before time moves.
    await expect
      .poll(async () => {
        const { count, error } = await adminClient()
          .from('poll_votes')
          .select('option_id', { count: 'exact', head: true })
          .eq('poll_id', poll!.id)
          .eq('weight', 2);
        if (error) throw error;
        return count ?? 0;
      })
      .toBeGreaterThan(0);

    const { error: backdateError } = await adminClient()
      .from('polls')
      .update({ vote_deadline: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', poll!.id);
    expect(backdateError, backdateError?.message).toBeNull();

    await runCascadeSweep(request);

    const { data: decided } = await adminClient()
      .from('polls')
      .select('phase, winning_option_id')
      .eq('id', poll!.id)
      .single();
    expect(decided?.phase).toBe('decided');
    expect(decided?.winning_option_id, 'the poll closed without picking the clear favourite').toBeTruthy();
    const { data: chosen } = await adminClient()
      .from('poll_options')
      .select('label')
      .eq('id', decided!.winning_option_id)
      .single();
    expect(chosen?.label).toBe(winner);

    // The group sees the decision, and nothing is left to vote on.
    await page.reload();
    const plan = page.getByText('The plan', { exact: true }).locator('..');
    await expect(plan).toContainText(winner);
    await expect(page.getByRole('group', { name: `Rate ${winner}` })).toHaveCount(0);
    await expect(page.getByText(/Voting closes/)).toHaveCount(0);
  });

  test('a co-host added by the host can run the plan', async ({ page, browser }) => {
    const title = unique('Co-host plan ');
    await login(page, 'e2ehost');
    const eventUrl = await createPlan(page, title, {
      People: async (wizard) => {
        await pickFriend(wizard, 'E2E Guest');
        await expect(wizard.getByText('1 person selected')).toBeVisible();
      },
    });
    const eventId = eventIdOf(eventUrl);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // The host shares their powers with a friend who is on the plan.
    const cohosts = page.locator('section', {
      has: page.getByRole('heading', { name: 'Co-hosts', exact: true }),
    });
    await cohosts.getByRole('button', { name: /\+ E2E Guest/ }).click();
    await expect(cohosts.getByRole('listitem').filter({ hasText: 'E2E Guest' })).toBeVisible();
    await expect(cohosts.getByRole('button', { name: 'remove' })).toBeVisible();

    await asPerson(browser, 'e2eguest', async (cohost) => {
      await cohost.goto(eventUrl);
      await expect(cohost.getByRole('heading', { name: title, level: 1 })).toBeVisible();

      // Host powers, but not the primary host's: no permanent delete, and no
      // say over who else co-hosts.
      await expect(cohost.getByRole('link', { name: /Edit plan/ })).toBeVisible();
      await expect(cohost.getByRole('button', { name: 'Delete permanently' })).toHaveCount(0);
      await expect(cohost.getByRole('heading', { name: 'Co-hosts', exact: true })).toHaveCount(0);

      await cohost.getByRole('button', { name: /Lock it in - confirm the plan/ }).click();
      await expect(cohost.getByText('✓ Confirmed')).toBeVisible();
      await expect(cohost.getByRole('button', { name: /Lock it in/ })).toHaveCount(0);
    });

    const { data: event } = await adminClient()
      .from('events')
      .select('status')
      .eq('id', eventId)
      .single();
    expect(event?.status).toBe('confirmed');

    // The host sees what their co-host did.
    await page.reload();
    await expect(page.getByText('✓ Confirmed')).toBeVisible();
  });
});
