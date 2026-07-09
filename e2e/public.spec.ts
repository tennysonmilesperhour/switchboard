import { expect, test } from '@playwright/test';

test.describe('public surface', () => {
  test('landing hero loads', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Make plans.');
  });

  test('landing links to sign in', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('link', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel('Email or username')).toBeVisible();
  });

  test('unauthenticated app routes redirect to welcome', async ({ page }) => {
    await page.goto('/plans');
    await expect(page).toHaveURL(/\/welcome/);
  });

  test('unknown guest RSVP token shows a graceful message', async ({ page }) => {
    await page.goto('/rsvp/00000000-0000-0000-0000-000000000000');
    await expect(page.getByText('isn’t here anymore')).toBeVisible();
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
    await page.getByLabel('Email or username').fill('missing_user');
    await page.getByLabel('Password').fill('incorrect-password');
    const submit = page.locator('form').getByRole('button', { name: 'Sign in', exact: true });
    await submit.click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 });
    await expect(submit).toBeEnabled();
  });

  test('password recovery and legal pages are reachable', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms' })).toBeVisible();
  });
});
