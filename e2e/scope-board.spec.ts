import { expect, test } from '@playwright/test';

const boardPath = '**/api/scope-progress';
const mark = { at: '2026-09-25T10:00:00Z', by: 'Reviewer' };

test('a slow initial read merges other reviewers’ checks without replacing a newer local edit', async ({ page }) => {
  let releaseRead!: () => void;
  const held = new Promise<void>((resolve) => { releaseRead = resolve; });
  await page.route(boardPath, async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { ok: true } });
    await held;
    return route.fulfill({ json: { ok: true, checked: { A2: mark }, notes: [] } });
  });
  await page.goto('/scope-verification');
  await page.getByRole('checkbox', { name: /Verify A1:/ }).check();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('swb-scope-pending-v1'))).toBe('{}');
  releaseRead();
  await expect(page.getByRole('checkbox', { name: /Verify A1:/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Verify A2:/ })).toBeChecked();
  await expect(page.locator('#revDone')).toHaveText('2');
});

test('an unavailable board explains what is local and never counts invented items', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('swb-scope-v4', JSON.stringify({ A1: true, Z999: true }));
  });
  await page.route(boardPath, (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/scope-verification');
  await expect(page.locator('#revDone')).toHaveText('1');
  await expect(page.locator('#cntLeft')).toHaveText('34');
  await expect(page.locator('#boardNote')).toContainText('could not be loaded');
  await expect(page.locator('#boardNote')).toContainText('SB-SCOPE-BOARD');
  await expect(page.locator('#notesList')).toContainText('Notes could not be loaded');
  await expect(page.getByRole('checkbox', { name: /Verify A1:/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Refresh shared board' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Reset all' })).toHaveCount(0);
});

test('a slow failed write preserves every later edit and replays them after reload', async ({ page }) => {
  const checked: Record<string, typeof mark> = {};
  const writes: { itemId: string; checked: boolean }[] = [];
  let releaseFirst!: () => void;
  const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let fail = true;
  await page.route(boardPath, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (writes.length === 1) await firstHeld;
      if (fail) return route.fulfill({ status: 503, body: '{}' });
      if (body.checked) checked[body.itemId] = mark;
      else delete checked[body.itemId];
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true, checked, notes: [] } });
  });
  await page.goto('/scope-verification');
  await expect(page.locator('#notesList')).toContainText('No notes yet');
  const first = page.getByRole('checkbox', { name: /Verify A1:/ });
  await first.check();
  await expect.poll(() => writes.length).toBe(1);
  await page.getByRole('checkbox', { name: /Verify A2:/ }).check();
  await first.uncheck();
  // This must already be durable while the first POST is still in flight.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('swb-scope-pending-v1')!)))
    .toEqual({ A1: false, A2: true });
  releaseFirst();
  await expect(page.locator('#boardNote')).toContainText('2 changes are saved');

  // A stale checked value from the server must not override the pending untick.
  checked.A1 = mark;
  fail = false;
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Verify A1:/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Verify A2:/ })).toBeChecked();
  await expect.poll(() => checked).toEqual({ A2: mark });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('swb-scope-pending-v1')!)))
    .toEqual({});
  await page.reload();
  await expect(page.locator('#revDone')).toHaveText('1');
  await expect(page.getByRole('checkbox', { name: /Verify A1:/ })).not.toBeChecked();
  expect(writes.map(({ itemId, checked }) => ({ itemId, checked }))).toEqual([
    { itemId: 'A1', checked: true },
    { itemId: 'A1', checked: false },
    { itemId: 'A2', checked: true },
  ]);
});

test('a failed migration of old device checks survives a second page load', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('scope-test-seeded')) {
      localStorage.setItem('swb-scope-v4', JSON.stringify({ A1: true }));
      localStorage.setItem('scope-test-seeded', 'yes');
    }
  });
  let fail = true;
  const writes: unknown[] = [];
  await page.route(boardPath, (route) => {
    if (route.request().method() === 'POST') {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: fail ? 503 : 200, json: { ok: !fail } });
    }
    return route.fulfill({ json: { ok: true, checked: {}, notes: [] } });
  });
  await page.goto('/scope-verification');
  await expect(page.locator('#boardNote')).toContainText('1 change is saved');
  await expect(page.getByRole('checkbox', { name: /Verify A1:/ })).toBeChecked();
  fail = false;
  await page.reload();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({ itemId: 'A1', checked: true });
  await expect(page.getByRole('checkbox', { name: /Verify A1:/ })).toBeChecked();
});

test('feedback appears on the board immediately after sending', async ({ page }) => {
  const notes: unknown[] = [];
  await page.route(boardPath, (route) => route.fulfill({
    json: { ok: true, checked: {}, notes },
  }));
  await page.route('**/api/scope-feedback', (route) => {
    notes.push({
      id: 'note', at: mark.at, body: 'The control is hard to find.',
      itemId: 'A1', itemLabel: 'Create a plan', reporter: 'Reviewer', screenshots: [], status: 'new',
    });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/scope-verification');
  await page.getByRole('button', { name: 'Report a problem' }).first().click();
  await page.getByLabel('What happened, or what would you rather it did?').fill('The control is hard to find.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('#notesCount')).toHaveText('1');
  await expect(page.locator('#notesList')).toContainText('The control is hard to find.');
});
