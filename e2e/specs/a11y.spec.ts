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
  { path: '/ops/metrics', name: 'metrics' },
  { path: '/ops/audit', name: 'audit log (gated for a consumer)' },
  // The lane boots as `consumer`, so this axe-checks the *refusal* — which is a real
  // rendered surface with a Banner and a persona-switch Button, not an empty page.
  // The page itself is covered in `admin.spec.ts`, after a switch.
  { path: '/ops/sync', name: 'sync connectors (gated for a consumer)' },
];

/** The session bootstrap has to finish before the page means anything. */
async function ready(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();
}

for (const route of ROUTES) {
  test(`no critical a11y violations: ${route.name}`, async ({ page }) => {
    await ready(page, route.path);

    const { violations } = await new AxeBuilder({ page })
      .include('#root')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = violations.filter((v) => v.impact === 'critical');
    expect(
      critical,
      `Critical violations on ${route.path}:\n` +
        critical.map((v) => `  ${v.id}: ${v.help}`).join('\n'),
    ).toEqual([]);
  });
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
    const opsTabs = labels.filter((t) => ['Health', 'Metrics', 'Audit log'].includes(t.trim()));
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

test('informational chips are not focusable controls', async ({ page }) => {
  await ready(page, '/catalog');

  // Salt's Pill is a <button>; Tag is not. Using Pill for the tenant, role and
  // row type turned ~40 labels into tab stops that did nothing.
  const stops: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    stops.push((await page.evaluate(() => document.activeElement?.textContent ?? '')).trim());
  }
  expect(stops.some((s) => s === 'consumer')).toBe(false);
});
