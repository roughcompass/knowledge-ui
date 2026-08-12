import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The accessibility gate.
 *
 * `@axe-core/playwright` was a dependency of this repo before a single spec used
 * it, and `e2e/specs/` was an empty directory. The threshold and shape here match
 * what the workspace already accepted for the sibling app: axe tags `wcag2a` and
 * `wcag2aa`, scoped to `#root`, zero violations of `critical` impact.
 *
 * Scoped to `#root` on purpose — anything outside it belongs to the harness, not
 * the app.
 *
 * Alongside axe there are assertions for four things it cannot see, each of which
 * was a real defect found by hand:
 *
 *   - a document can have exactly one `main` landmark, and this app had none;
 *   - a skip link has to be the *first* focusable element to be any use;
 *   - two navigation items both claiming `aria-current="page"` is valid HTML and
 *     nonsense to a screen reader;
 *   - a heading level is not a font size, and section headings that render as
 *     `<div>` leave a page with no outline.
 */

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/catalog', name: 'capability list' },
  { path: '/catalog?q=ledger', name: 'search results' },
  { path: '/ops', name: 'health' },
  // Merged into /ops; the path survives as a redirect and is swept as one.
  { path: '/ops/metrics', name: 'operational health (redirects to health)' },
  { path: '/ops/audit', name: 'audit log (gated for a consumer)' },
  // The lane boots as `consumer`, so this axe-checks the *refusal* — which is a real
  // rendered surface with a Banner and a persona-switch Button, not an empty page.
  // The page itself is covered in `admin.spec.ts`, after a switch.
  { path: '/ops/sync', name: 'sync connectors (gated for a consumer)' },
  // The consumer surfaces. The detail page carries the adopt control and the
  // subscriptions card; the inbox carries a filter, a table of row actions, a
  // bulk action and two unavailability notices.
  { path: '/catalog/notifications', name: 'notifications inbox' },
  { path: '/catalog/claims', name: 'claims browser' },
  { path: '/catalog/claims/queue', name: 'curation queue' },
  { path: '/catalog/context', name: 'retrieval tests' },
  { path: '/catalog/context/receipts', name: 'ARC receipt inspector' },
  { path: '/ops/usage', name: 'usage console' },
  { path: '/catalog/salt-design-system', name: 'capability detail (adopt + subscriptions)' },
  // Each tab is its own route, so each is swept: a tab that only exists as click
  // state is one no sweep can reach and no colleague can be sent.
  { path: '/catalog/salt-design-system/interface', name: 'capability interface' },
  { path: '/catalog/salt-design-system/impact', name: 'capability impact' },
  { path: '/catalog/salt-design-system/record', name: 'capability record fields' },
  {
    path: '/catalog/salt-design-system?as_of=2026-01-01T00:00:00Z',
    name: 'capability as it stood (historical view)',
  },
];

/** The session bootstrap has to finish before the page means anything. */
async function ready(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();
}

/**
 * Both modes, because half of what this gate can catch is colour.
 *
 * The design standard claimed this sweep ran "light and dark" and asserted it was
 * enforced. It ran in one mode, and there was no second pass anywhere in these specs
 * — a table claiming a gate it did not have. It had a live cost: every inline link in
 * the app rendered as an unstyled browser-default anchor for as long as the app has
 * existed, which is worst in dark mode, and is precisely the class of defect a
 * contrast check finds.
 *
 * Dark is selected by writing the mode the app persists, before the first paint, so
 * the run never sees a light frame. Reading the toggle instead would depend on the
 * rail being rendered and on the control keeping its label.
 */
const MODES = ['light', 'dark'] as const;

for (const mode of MODES) {
  for (const route of ROUTES) {
    test(`no critical a11y violations in ${mode}: ${route.name}`, async ({ page }) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem('kui:color-mode', value);
      }, mode);

      await ready(page, route.path);

      // Assert the mode actually took before trusting a pass. A dark run that
      // silently rendered light is a green result for a check that never happened,
      // which is the failure this whole sweep exists to stop being possible.
      // Salt's next theme carries the mode as an attribute, not a class.
      await expect(page.locator('html.salt-theme')).toHaveAttribute('data-mode', mode);

      const { violations } = await new AxeBuilder({ page })
        .include('#root')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const critical = violations.filter((v) => v.impact === 'critical');
      expect(
        critical,
        `Critical violations on ${route.path} in ${mode}:\n` +
          critical.map((v) => `  ${v.id}: ${v.help}`).join('\n'),
      ).toEqual([]);
    });
  }
}

test('every page has exactly one main landmark and a working skip link', async ({ page }) => {
  for (const route of ROUTES) {
    await ready(page, route.path);
    await expect(page.getByRole('main'), route.path).toHaveCount(1);

    // First tab from the document start must reach the skip link, or a keyboard
    // reader still crosses the whole header and nav on every route.
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus'), route.path).toContainText(/skip to main/i);
  }
});

test('at most one navigation item is the current page', async ({ page }) => {
  for (const route of ROUTES) {
    await ready(page, route.path);
    const current = page.locator('[aria-current="page"]');

    // The left nav marks the section; a sub-nav may mark the page within it.
    // What must never happen is two siblings claiming the same thing, which is
    // what a prefix match on the index route produced.
    const labels = await current.allInnerTexts();
    const opsTabs = labels.filter((t) => ['Health', 'Audit Log'].includes(t.trim()));
    expect(opsTabs.length, `${route.path} marked ${opsTabs.length} ops tabs current`).toBeLessThan(
      2,
    );
  }
});

test('pages have a heading outline, not just styled text', async ({ page }) => {
  await ready(page, '/');
  await expect(page.locator('h1')).toHaveCount(1);
  // Section headings must be real headings. They rendered as <div> because
  // `styleAs` sets the type scale and says nothing about the element.
  expect(await page.locator('h2').count()).toBeGreaterThan(0);
});

test('every route has exactly one h1, including the ones that refuse', async ({ page }) => {
  /*
   * Extended from the home route to all of them, because the gap was the whole
   * defect. Two of these paths are refused for the lane's default persona, and a
   * refusal replaces the page — including the `PageHeader` the page would have
   * rendered. So `/ops/audit` and `/ops/sync` had no `h1`, no `h2`, and no document
   * outline at all: a sighted reader could read the banner, and a screen-reader user
   * landed on a heading-less document that never said which page had refused them.
   *
   * axe did not object, and it is right not to — a document with no headings breaks
   * no WCAG success criterion it checks. The assertion that catches this has to be
   * written, and it has to visit more than the one route that was already correct.
   */
  for (const route of ROUTES) {
    await ready(page, route.path);
    await expect(page.locator('h1'), `${route.name} has exactly one h1`).toHaveCount(1);
  }
});

test('labels use semantic presentations instead of generic chips', async ({ page }) => {
  await ready(page, '/catalog');

  // Salt's Pill is a <button>; Tag is not. Using Pill for the tenant, role and
  // row type turned ~40 labels into tab stops that did nothing.
  await expect(page.locator('header .saltTag')).toHaveCount(0);
  await expect(page.locator('tbody .saltTag')).toHaveCount(0);

  const stops: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    stops.push((await page.evaluate(() => document.activeElement?.textContent ?? '')).trim());
  }
  expect(stops.some((s) => s === 'consumer')).toBe(false);

  await ready(page, '/catalog/claims');
  const claimTags = await page.locator('tbody .saltTag').allTextContents();
  expect(claimTags.every((label) => ['high', 'moderate', 'low'].includes(label.trim()))).toBe(true);
  expect(await page.locator('tbody .saltStatusIndicator').count()).toBeGreaterThan(0);

  await page.getByRole('combobox', { name: 'Signed in as' }).click();
  await page.getByRole('option', { name: /admin/i }).first().click();
  await expect(page.getByText('admin', { exact: true }).first()).toBeVisible();

  await ready(page, '/ops/sync/runs');
  await expect(page.locator('tbody .saltTag')).toHaveCount(0);
  expect(await page.locator('tbody .saltStatusIndicator').count()).toBeGreaterThan(0);
});
