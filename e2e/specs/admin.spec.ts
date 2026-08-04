import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The operator surfaces, as an admin.
 *
 * Separate from `a11y.spec.ts` because reaching these pages needs an identity the lane
 * does not boot with, and the switch itself is worth exercising: it clears the whole
 * query cache, which is the behaviour that most matters once admin data has been in
 * it.
 *
 * These run against the **built** artefacts, so unlike the component tests they cross
 * the real federation boundary — the one place `instanceof` across two bundled copies
 * of `api-client` would fail. That is not hypothetical: it is the bug that made a 422
 * report zero field errors, and only a test on this side of the boundary would have
 * caught it.
 */

/**
 * Become the admin persona through the visible switcher.
 *
 * Deliberately not by seeding `sessionStorage`. The key is an FNV-1a hash of the
 * storage namespace, so hardcoding it in a spec would silently stop working the day
 * that namespace changes — and driving the real control also covers
 * `queryClient.clear()`, which is the interesting part.
 */
async function switchToAdmin(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();

  await page.getByRole('combobox', { name: 'Signed in as' }).click();
  await page.getByRole('option', { name: /admin/i }).first().click();

  // The switch re-resolves the session, so wait for the new role rather than a timer.
  await expect(page.getByText('admin', { exact: true }).first()).toBeVisible();
}

test('an admin reaches the sync pages and a consumer does not', async ({ page }) => {
  await page.goto('/ops/sync', { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();

  // As the default consumer: refused, and told which role would work rather than
  // being shown an empty table.
  await expect(page.getByText(/needs the admin role/i)).toBeVisible();
  /*
   * The page's *content* is absent, asserted through the table rather than through
   * the heading.
   *
   * The heading was the proxy here, and it stopped being a valid one: a refusal is a
   * page and now carries the heading its page would have had, because replacing the
   * screen used to leave the document with no `h1` and no outline at all. So the
   * title is present in both states by design, and the thing that actually separates
   * them is whether the connector table rendered.
   */
  await expect(page.getByRole('table', { name: /sync connectors/i })).toHaveCount(0);
  // And the nav does not offer what it cannot deliver.
  await expect(page.locator('nav').getByRole('link', { name: 'Sync connectors' })).toHaveCount(0);

  await switchToAdmin(page);
  await page.goto('/ops/sync', { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { level: 1, name: 'Sync connectors' })).toBeVisible();
  await expect(page.locator('nav').getByRole('link', { name: 'Sync runs' })).toBeVisible();
});

test('no critical a11y violations on the sync pages', async ({ page }) => {
  await switchToAdmin(page);

  for (const path of ['/ops/sync', '/ops/sync/runs']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.getByRole('main')).toBeVisible();

    const { violations } = await new AxeBuilder({ page })
      .include('#root')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = violations.filter((v) => v.impact === 'critical');
    expect(
      critical,
      `Critical violations on ${path}:\n` + critical.map((v) => `  ${v.id}: ${v.help}`).join('\n'),
    ).toEqual([]);
  }
});

test('the create form is accessible with the dialog open', async ({ page }) => {
  // A modal is the one thing axe cannot reach by navigating, because it only exists
  // after an interaction. It is also where focus management goes wrong.
  await switchToAdmin(page);
  await page.goto('/ops/sync', { waitUntil: 'networkidle' });

  await page
    .locator('tbody tr', { hasText: 'docs-corpus' })
    .getByRole('button', { name: 'Deactivate' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .include('#root')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const critical = violations.filter((v) => v.impact === 'critical');
  expect(critical, critical.map((v) => `  ${v.id}: ${v.help}`).join('\n')).toEqual([]);
});

test('a write survives the federation boundary and lands on its field', async ({ page }) => {
  /*
   * The regression test for the bug this slice actually shipped and then fixed.
   *
   * `api-client` is bundled into the shell *and* into each remote. The client that
   * throws lives in the shell's copy; the page that maps the error lives in the
   * remote's. An `instanceof RegistryError` guard is false across that boundary, so
   * a 422 full of `$.`-pathed field errors produced *none* — and every unit and
   * component test still passed, because in those there is only one copy.
   *
   * Only a spec on this side of the boundary can catch it.
   */
  await switchToAdmin(page);
  await page.goto('/ops/sync', { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Add a source' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  const displayName = page.getByRole('textbox', { name: /display name/i });
  const describedBy = await displayName.getAttribute('aria-describedby');
  expect(describedBy, 'the field must reference a message element').toBeTruthy();
  // An attribute selector, not `#id`: React generates ids like `helperText-:ra:`, and
  // the colons are not valid in a CSS id selector without escaping.
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Field required');
});

test('run now reports a receipt and does not link a run that does not exist', async ({ page }) => {
  await switchToAdmin(page);
  await page.goto('/ops/sync', { waitUntil: 'networkidle' });

  const row = page.locator('tbody tr', { hasText: 'docs-corpus' });
  await row.getByRole('button', { name: 'Run now' }).click();

  await expect(page.getByText(/Queued a manual run of docs-corpus/)).toBeVisible();

  /*
   * `trigger` mints a `sync_run_id` into its response that matches no row — the run
   * is written later by the scheduler, so fetching that id 404s. The receipt must
   * therefore name the source and offer no link.
   */
  const receipt = page.getByRole('status').filter({ hasText: 'Queued a manual run' });
  await expect(receipt.getByRole('link')).toHaveCount(0);
});

test('an inactive source cannot be triggered', async ({ page }) => {
  // The server answers 409. Disabling the control says so before the reader spends a
  // click finding out.
  await switchToAdmin(page);
  await page.goto('/ops/sync', { waitUntil: 'networkidle' });

  const inactive = page.locator('tbody tr', { hasText: 'retired-adr-import' });
  await expect(inactive.getByRole('button', { name: 'Run now' })).toBeDisabled();
  await expect(inactive.getByRole('button', { name: 'Reactivate' })).toBeVisible();
});

test('the operational health page renders its data and passes axe as an admin', async ({
  page,
}) => {
  /*
   * The a11y sweep visits /ops/metrics as a consumer, which renders the
   * role-refusal notice — a real surface, but not the one with the data in it.
   * The populated state has a table, four stat tiles and a caveat, and none of
   * that had ever been axe-checked.
   */
  await switchToAdmin(page);
  await page.goto('/ops/metrics', { waitUntil: 'networkidle' });

  await expect(page.getByText('Embedding outbox')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  // The qualifier that stops a per-replica counter reading as a service total.
  await expect(page.getByText(/does not prove zero everywhere/i)).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .include('#root')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const critical = violations.filter((v) => v.impact === 'critical');
  expect(critical, critical.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
});
