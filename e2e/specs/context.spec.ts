import { expect, test, type Page } from '@playwright/test';

const READY_RECEIPT_ID = '11111111-1111-4111-8111-111111111111';

async function ready(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();
}

test('a retrieval workbench returns source-labelled records for direct review', async ({
  page,
}) => {
  await ready(page, '/catalog/context');

  await expect(page.getByRole('heading', { name: 'Retrieval Tests' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Test Setup' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Results' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Test Cases (0)' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Run History (0)' })).toBeVisible();

  await page.getByRole('textbox', { name: /agent task/i }).fill('Salt');
  await page.getByRole('button', { name: 'Run Retrieval Test' }).click();

  await expect(page.getByRole('heading', { name: 'Catalog Records Results' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Why It Matched' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Verdict' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Include salt-design-system' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exclude salt-design-system' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save as Test Case' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Run History (1)' })).toBeVisible();
});

test('the populated evaluation grid stays within the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page, '/catalog/context');

  await page.getByRole('textbox', { name: /agent task/i }).fill('Salt');
  await page.getByRole('button', { name: 'Run Retrieval Test' }).click();

  await expect(page.getByRole('columnheader', { name: 'Result' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Verdict' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Include salt-design-system' })).toBeVisible();

  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.document).toBe(width.viewport);
});

test('a real retained ARC receipt can be inspected without browser signing controls', async ({
  page,
}) => {
  await ready(page, `/catalog/context/receipts/${READY_RECEIPT_ID}`);

  await expect(page.getByRole('heading', { name: 'Resolution Record' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Event Chain' })).toBeVisible();
  await expect(page.getByText(/preserves selection decisions and event history/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /sign|challenge|resolve manifest/i })).toHaveCount(
    0,
  );
});
