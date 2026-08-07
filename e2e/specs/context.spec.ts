import { expect, test, type Page } from '@playwright/test';

const READY_RECEIPT_ID = '11111111-1111-4111-8111-111111111111';

async function ready(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();
}

test('a context message returns source-labelled evidence rather than an answer', async ({
  page,
}) => {
  await ready(page, '/catalog/context');

  await page.getByRole('textbox', { name: /task or query/i }).fill('Salt');
  await page.getByRole('button', { name: 'Probe Context' }).click();

  await expect(page.getByRole('heading', { name: 'Context Layer Returned' })).toBeVisible();
  await expect(page.getByText(/Exact records from the selected source/)).toBeVisible();
  await expect(page.getByText('Server Relevance').first()).toBeVisible();
  // The promise moved from a banner into the page description.
  await expect(page.getByText(/raw records, never generated answers/i)).toBeVisible();
});

test('a real retained ARC receipt can be inspected without browser signing controls', async ({
  page,
}) => {
  await ready(page, `/catalog/context/receipts/${READY_RECEIPT_ID}`);

  await expect(page.getByRole('heading', { name: 'Resolution Record' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Event Chain' })).toBeVisible();
  await expect(page.getByText(/recorded at run time and is not regenerated/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /sign|challenge|resolve manifest/i })).toHaveCount(
    0,
  );
});
