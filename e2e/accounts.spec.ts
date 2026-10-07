import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  adminClient,
  createAccount,
  DB,
  LEGAL_VERSION,
  linkIn,
  pageComplaints,
  requireMailRelay,
  signIn,
  submitSignIn,
  unique,
  waitForMail,
} from './support';

/**
 * Getting into an account, and out of one (docs/AUTH.md). Five releases have
 * shipped a bug where someone holding valid credentials could not sign in,
 * create an account or recover one, each found by a user. These walk the
 * journeys those bugs broke, through the real forms, with the real emails.
 *
 * Every journey uses a fresh account made for it, so none of them spends the
 * seeded users' sign-ins or changes what the other journeys rely on. Emails
 * are read out of the local Mailpit (the app posts them through
 * e2e/mail-relay.ts); nothing here assembles a link the app did not send.
 */

const WRONG_CREDENTIALS = 'That email, username, or password did not work.';

/** A device that has never been signed in. */
async function freshDevice<T>(browser: Browser, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    return await fn(await context.newPage());
  } finally {
    await context.close();
  }
}

/** Where a signed-in person lands: Home, with the app shell around it. */
/**
 * A brand-new account is shown the short walkthrough before Home. Skip has to
 * be on its first frame and has to land on Home — a tour that can't be left is
 * a dead end the day after sign-up.
 */
async function skipFirstRunTour(page: Page) {
  await expect(page).toHaveURL(/\/tour\/welcome\?first=1/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Start with the + button' })).toBeVisible();
  await page.getByRole('link', { name: 'Skip tour' }).click();
}

async function expectHome(page: Page) {
  await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 30_000 });
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Statuses' })).toBeVisible();
}

/** Fill the create-account form: name, identifier, password, both agreements. */
async function submitSignUp(page: Page, name: string, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create account', exact: true }).first().click();
  const form = page.locator('form', { has: page.getByPlaceholder('Your name') });
  await form.getByPlaceholder('Your name').fill(name);
  await form.getByPlaceholder('email or username').fill(identifier);
  await form.getByPlaceholder('Password', { exact: true }).fill(password);
  await form.getByLabel(/I agree to use Switchboard with kindness/).check();
  await form.getByLabel(/I confirm I am at least 18 years old/).check();
  await form.getByRole('button', { name: 'Create account' }).click();
}

/** Step one of onboarding: the agreements, then Continue. */
async function agreeAndContinue(page: Page) {
  await page.getByLabel(/I agree to use Switchboard with kindness/).check();
  await page.getByLabel(/I confirm I am at least 18 years old/).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** Sign in expecting a refusal, and return what the form said. */
async function refusedSignIn(page: Page, identifier: string, password: string): Promise<string> {
  await page.goto('/login');
  await submitSignIn(page, identifier, password);
  const alert = page.getByRole('alert').filter({ hasText: /\S/ }).first();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/login/);
  return pageComplaints(page);
}

test.describe('accounts', () => {
  test.skip(!DB, 'requires a seeded database (set E2E_DB=1 — see e2e/README.md)');
  test.skip(({ isMobile }) => isMobile, 'authenticated journeys run against the desktop app shell');

  test('an email sign-up confirms from its inbox and onboards to Home', async ({ browser }) => {
    requireMailRelay();
    const handle = unique('e2es');
    const email = `${handle}@example.com`;
    const password = `pw-${unique('')}-Signup`;

    await freshDevice(browser, async (page) => {
      await submitSignUp(page, 'Sam Signup', email, password);
      await expect(page.getByText('Account created.')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(`Check ${email} for a confirmation link`, { exact: false })).toBeVisible();

      // The link in the email is the only way in, and it lands in onboarding
      // already signed in.
      const mail = await waitForMail(email, 'Confirm your Switchboard account');
      await page.goto(linkIn(mail, '/auth/confirm'));
      await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'First, a little about you.' })).toBeVisible();
      await expect(page.getByText('Step 1 of 2')).toBeVisible();
      await expect(page.getByLabel('Your name')).toHaveValue('Sam Signup');

      await agreeAndContinue(page);
      await expect(page.getByText('Step 2 of 2')).toBeVisible();
      await page.getByRole('button', { name: 'Start connecting' }).click();
      await skipFirstRunTour(page);
      await expectHome(page);

      // Confirming the address recorded it as proven, which is what later lets
      // this account recover a forgotten password.
      const { data: profile } = await adminClient()
        .from('profiles')
        .select('id, onboarded')
        .eq('handle', handle)
        .single();
      expect(profile?.onboarded).toBe(true);
      const { data: contact } = await adminClient()
        .from('profile_contacts')
        .select('verified_at')
        .eq('user_id', profile!.id)
        .eq('kind', 'email')
        .single();
      expect(contact?.verified_at, 'the confirmed email was not marked verified').not.toBeNull();
    });
  });

  test('a username sign-up is signed in at once and onboards to Home', async ({ browser }) => {
    const handle = unique('e2eu');
    const password = `pw-${unique('')}-Username`;

    await freshDevice(browser, async (page) => {
      await submitSignUp(page, 'Una Username', handle, password);

      // No confirmation step for a username: creating the account is the
      // first sign-in (bug #82 was a sign-up that didn't establish a session).
      await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
      await expect(page.getByText('Step 1 of 3')).toBeVisible();
      await expect(page.getByLabel('Handle')).toHaveValue(handle);
      await agreeAndContinue(page);
      await expect(page.getByText('Step 2 of 3')).toBeVisible();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();

      // A username account can't recover a password without a verified email,
      // so onboarding asks for one — and never blocks on it.
      await expect(page.getByText('Step 3 of 3')).toBeVisible();
      await expect(page.getByLabel(/A recovery email/)).toBeVisible();
      await page.getByRole('button', { name: 'Skip for now' }).click();
      await skipFirstRunTour(page);
      await expectHome(page);

      await page.goto('/profile');
      await expect(page.getByText(`@${handle}`, { exact: true }).first()).toBeVisible();
    });
  });

  test('a forgotten password is reset from the emailed link', async ({ browser }) => {
    requireMailRelay();
    const handle = unique('e2er');
    const account = await createAccount({
      handle,
      name: 'Rita Reset',
      email: `${handle}@example.com`,
    });
    const newPassword = `pw-${unique('')}-Reset`;

    await freshDevice(browser, async (page) => {
      await page.goto('/login');
      await page.getByRole('link', { name: 'Forgot password?' }).click();
      await page.waitForURL(/\/forgot-password/);
      await page.getByPlaceholder('Email or username').fill(account.email);
      await page.getByRole('button', { name: 'Send recovery instructions' }).click();
      // Deliberately the same answer whether or not the account exists.
      await expect(
        page.getByRole('status').filter({ hasText: 'we’ll send instructions' }),
      ).toBeVisible();

      const mail = await waitForMail(account.email, 'Reset your Switchboard password');
      await page.goto(linkIn(mail, '/auth/confirm'));
      await page.waitForURL(/\/reset-password/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
      await page.getByLabel('New password').fill(newPassword);
      await page.getByRole('button', { name: 'Update password' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Password updated.' })).toBeVisible();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expectHome(page);
    });

    // On another device: the old password is now really wrong — the one case
    // where the generic sentence is correct — and the new one gets in.
    await freshDevice(browser, async (page) => {
      expect(await refusedSignIn(page, account.email, account.password)).toContain(
        WRONG_CREDENTIALS,
      );
      await page.getByPlaceholder('Password', { exact: true }).fill(newPassword);
      await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
      await expectHome(page);
    });
  });

  test('an account on old terms accepts the new ones and carries on', async ({ browser }) => {
    const account = await createAccount({
      handle: unique('e2el'),
      name: 'Lee Legal',
      legalVersion: '2000-01-01',
    });

    await freshDevice(browser, async (page) => {
      await signIn(page, account.handle, account.password);

      // The proxy funnels every app route here until the terms are accepted…
      await page.waitForURL(/\/legal-update/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Switchboard is for adults' })).toBeVisible();
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/legal-update\?next=%2Fsettings/);
      // …with a way out that doesn't need them accepted.
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

      await page
        .getByLabel('I confirm I am at least 18 years old and accept the updated terms.')
        .check();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();

      // …and then lets them go where they were going.
      await page.waitForURL(/\/settings$/, { timeout: 30_000 });
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      const { data: profile } = await adminClient()
        .from('profiles')
        .select('legal_terms_version')
        .eq('id', account.id)
        .single();
      expect(profile?.legal_terms_version).toBe(LEGAL_VERSION);

      // The acceptance holds: Home opens without the funnel.
      await page.goto('/');
      await expectHome(page);
    });
  });

  test('an account deleted from Settings is gone, and its sign-in says so', async ({ browser }) => {
    const account = await createAccount({ handle: unique('e2ed'), name: 'Dee Delete' });

    await freshDevice(browser, async (page) => {
      await signIn(page, account.handle, account.password);
      await page.goto('/settings');
      await page.getByLabel('Type DELETE to confirm').fill('DELETE');
      await page.getByRole('button', { name: 'Delete account', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Permanently delete your account?' });
      await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();

      await page.waitForURL(/\/welcome\?account=deleted/, { timeout: 30_000 });
      await expect(page.getByText('Your account was deleted.', { exact: false })).toBeVisible();

      // The session went with it.
      await page.goto('/settings');
      await expect(page).toHaveURL((url) => url.pathname !== '/settings');

      // Signing in again is refused as wrong credentials, which is now simply
      // true: there is no such account (docs/AUTH.md).
      expect(await refusedSignIn(page, account.handle, account.password)).toContain(
        WRONG_CREDENTIALS,
      );
    });

    const { data: gone } = await adminClient().auth.admin.getUserById(account.id);
    expect(gone?.user ?? null).toBeNull();
    const { data: profile } = await adminClient()
      .from('profiles')
      .select('id')
      .eq('id', account.id)
      .maybeSingle();
    expect(profile).toBeNull();
  });
});
