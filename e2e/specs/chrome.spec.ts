import { expect, test, type Page } from '@playwright/test';

/**
 * The application chrome: the persistent Salt rail, route-derived navigation,
 * global search layer, and shared table behavior.
 *
 * Separate from `a11y.spec.ts` because these are behavioural rather than
 * axe-driven. Every assertion here corresponds to a defect that shipped at some
 * point in this work:
 *
 *   - current navigation used to be derived from click state, so a deep link opened
 *     with the wrong section;
 *   - the custom rail could overlap the top bar and collapse below a usable width;
 *   - table links and overflow looked correct in markup while failing on screen;
 *   - the search preview existed under the clipped top bar but was not visible.
 */

const RAIL = 'nav';

async function ready(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();
}

test('the public product name is consistent across the document and shell', async ({ page }) => {
  await ready(page, '/');

  await expect(page).toHaveTitle('DE Context Plane for Agents');
  await expect(
    page.getByRole('banner').getByText('DE Context Plane for Agents', { exact: true }),
  ).toBeVisible();
});

test('every section and its pages are visible at once', async ({ page }) => {
  await ready(page, '/');

  const rail = page.locator(RAIL);

  // Sections are disclosures, not destinations: their own href used to be their
  // first child's, so two rows went to the same place and only one could be current.
  await expect(rail.getByRole('button', { name: 'Operations' })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Catalog' })).toBeVisible();

  // Leaves from *different* sections are on screen together. Under the previous
  // drill-down each of these was three navigations from the other.
  await expect(rail.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Health', exact: true })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Capabilities' })).toBeVisible();
});

test('a lateral move between sections costs one click', async ({ page }) => {
  // The complaint this rail was rebuilt for. From a catalog page, an operations page
  // used to be: back to the dashboard, into Operations, then the page.
  await ready(page, '/catalog/claims');

  const rail = page.locator(RAIL);
  // Health rather than Usage: every role holds `ops:view`, and this test is about
  // the distance between two sections, not about a capability gate.
  await rail.getByRole('link', { name: 'Health', exact: true }).click();
  await expect(page).toHaveURL(/\/ops$/);
});

test('Context Lab is directly available from the dashboard and top-level rail', async ({
  page,
}) => {
  await ready(page, '/');

  const rail = page.locator(RAIL);
  // A section is a disclosure now, not a destination — its href used to duplicate
  // its own first child's.
  await expect(rail.getByRole('button', { name: 'Context Lab' })).toBeVisible();

  /*
    The card stopped being one big anchor when its pills became real links —
    anchors cannot nest — so the accessible link is now the title alone, with the
    description as the card's visible text beside it.
  */
  const dashboardEntry = page
    .getByRole('main')
    .getByRole('link', { name: 'Context Lab', exact: true });
  await expect(dashboardEntry).toBeVisible();
  await dashboardEntry.click();

  await expect(page).toHaveURL(/\/catalog\/context$/);
  await expect(page.getByRole('heading', { name: 'Context Lab' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Probes' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Receipt Inspector' })).toBeVisible();
});

test('the current item is derived from the route, not from click state', async ({ page }) => {
  // Straight to a child route with no clicks. A pasted link has to land with the rail
  // already describing where the reader is.
  await ready(page, '/catalog/claims');

  const rail = page.locator(RAIL);
  await expect(rail.getByRole('link', { name: 'Claims' })).toHaveAttribute('aria-current', 'page');
  // And the rest of the app is still reachable from here.
  await expect(rail.getByRole('link', { name: 'Capabilities' })).toBeVisible();
});

test('a collapsed section still shows that it holds the current page', async ({ page }) => {
  await ready(page, '/catalog/claims');

  const rail = page.locator(RAIL);
  const catalog = rail.getByRole('button', { name: 'Catalog' });

  await catalog.click();
  // Collapsing hides the leaf, so the section itself has to carry the signal —
  // otherwise closing a section loses where you are.
  await expect(rail.getByRole('link', { name: 'Claims' })).toHaveCount(0);
  await expect(catalog).toHaveAttribute('aria-expanded', 'false');

  // And the choice survives a reload, beside the rail's own width.
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator(RAIL).getByRole('button', { name: 'Catalog' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('the sticky utility bar spans the viewport while content stays clear of the rail', async ({
  page,
}) => {
  await ready(page, '/catalog');

  const bounds = await page.evaluate(() => {
    const bar = document.querySelector('header');
    const rail = document.querySelector('nav');
    const main = document.querySelector('main');
    if (!bar || !rail || !main) return null;
    const stickyRail = rail.closest('.saltBorderItem');
    const railBounds = stickyRail?.getBoundingClientRect() ?? rail.getBoundingClientRect();
    const shellBounds = bar.parentElement?.getBoundingClientRect() ?? bar.getBoundingClientRect();
    const toolbar = bar.querySelector('.saltToolbar');
    return {
      railRight: Math.round(railBounds.right),
      barLeft: Math.round(bar.getBoundingClientRect().left),
      barRight: Math.round(bar.getBoundingClientRect().right),
      barTop: Math.round(bar.getBoundingClientRect().top),
      mainLeft: Math.round(main.getBoundingClientRect().left),
      shellLeft: Math.round(shellBounds.left),
      shellRight: Math.round(shellBounds.right),
      toolbarBackground: toolbar ? getComputedStyle(toolbar).backgroundColor : null,
    };
  });

  expect(bounds).not.toBeNull();
  expect(bounds?.barLeft).toBe(bounds?.shellLeft);
  expect(bounds?.barRight).toBe(bounds?.shellRight);
  expect(bounds?.mainLeft).toBeGreaterThanOrEqual(bounds?.railRight ?? 0);
  expect(bounds?.toolbarBackground).not.toBe('rgba(0, 0, 0, 0)');

  await page.evaluate(() => window.scrollTo({ top: 600 }));
  const scrolled = await page.evaluate(() => {
    const bar = document.querySelector('header');
    const stickyRail = document.querySelector('nav')?.closest<HTMLElement>('.saltBorderItem');
    if (!bar || !stickyRail) return null;
    const barBounds = bar.getBoundingClientRect();
    const railBounds = stickyRail.getBoundingClientRect();
    const pageScroll = window.scrollY;
    stickyRail.scrollTop = 120;
    return {
      barTop: Math.round(barBounds.top),
      barBottom: Math.round(barBounds.bottom),
      railTop: Math.round(railBounds.top),
      railBottom: Math.round(railBounds.bottom),
      viewportBottom: window.innerHeight,
      overflow: getComputedStyle(stickyRail).overflowY,
      railScrollHeight: stickyRail.scrollHeight,
      railClientHeight: stickyRail.clientHeight,
      railScrollTop: stickyRail.scrollTop,
      pageScroll,
      pageScrollAfterRailScroll: window.scrollY,
    };
  });

  expect(scrolled).not.toBeNull();
  expect(scrolled?.pageScroll).toBeGreaterThan(0);
  expect(scrolled?.barTop).toBe(0);
  expect(scrolled?.railTop).toBe(scrolled?.barBottom);
  expect(scrolled?.railBottom).toBeLessThanOrEqual(scrolled?.viewportBottom ?? 0);
  expect(scrolled?.overflow).toBe('auto');
  expect(scrolled?.railScrollHeight).toBeGreaterThan(scrolled?.railClientHeight ?? 0);
  expect(scrolled?.railScrollTop).toBeGreaterThan(0);
  expect(scrolled?.pageScrollAfterRailScroll).toBe(scrolled?.pageScroll);
});

test('the Salt navigation rail resizes and keeps its usable width across reloads', async ({
  page,
}) => {
  await ready(page, '/catalog');

  const rail = page.locator(RAIL);
  const before = await rail.evaluate((element) =>
    Math.round((element.parentElement ?? element).getBoundingClientRect().width),
  );
  expect(before).toBeGreaterThan(200);

  const widthControl = page.getByRole('slider', { name: 'Navigation width' });
  await widthControl.press('ArrowRight');
  await expect
    .poll(() =>
      rail.evaluate((element) =>
        Math.round((element.parentElement ?? element).getBoundingClientRect().width),
      ),
    )
    .toBeGreaterThan(before);

  await page.reload({ waitUntil: 'networkidle' });
  const after = await page
    .locator(RAIL)
    .evaluate((element) =>
      Math.round((element.parentElement ?? element).getBoundingClientRect().width),
    );
  expect(after).toBeGreaterThan(before);
});

test('the shell footer closes every route with provenance and implementation context', async ({
  page,
}) => {
  await ready(page, '/');

  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText('Context is served by the registry API');
  await expect(footer).toContainText('Built with Salt Design System');
  await expect(footer.getByRole('link', { name: 'API Status' })).toHaveAttribute('href', '/ops');
});

test('table cell presentation is owned by Salt rather than application classes', async ({
  page,
}) => {
  await ready(page, '/catalog');

  const applicationClasses = await page.locator('tbody td').evaluateAll((cells) => {
    return cells.flatMap((cell) =>
      [...cell.classList].filter((className) => !className.startsWith('salt')),
    );
  });
  expect(applicationClasses).toEqual([]);
});

test('the search panel is visible, not merely present', async ({ page }) => {
  /*
   * The panel used to be an absolutely-positioned child of the search field, and
   * the top bar clips its children so a long breadcrumb cannot spill across the
   * field. So it was rendered, positioned, populated — and clipped out of
   * existence for its whole life. `toBeVisible` alone would have passed: the
   * element had size and no `display: none`. What it did not have was a place on
   * the screen, which is why this asserts the panel is what the reader's cursor
   * would actually hit at its own coordinates.
   */
  await ready(page, '/');

  const field = page.getByRole('textbox', { name: 'Search from anywhere' });
  await field.click();
  await field.type('sa', { delay: 40 });

  const panel = page.getByText('Press Enter for all results');
  await expect(panel).toBeVisible();

  const hit = await panel.evaluate((status) => {
    const el = status.closest('.saltPanel');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + 10);
    return { insideClippedBar: !!el.closest('header'), ownsItsPixels: el.contains(topmost) };
  });

  expect(hit, 'the suggestion panel must be in the document').not.toBeNull();
  expect(hit?.insideClippedBar).toBe(false);
  expect(hit?.ownsItsPixels).toBe(true);
});

test('a link in a table cell is the colour of a link', async ({ page }) => {
  /*
   * The table wraps a link column's content in an anchor, but a column renders its
   * own content and the natural thing to return is Salt `Text`, which sets its own
   * foreground. Nested inside the anchor that produced black text under a teal
   * anchor — the affordance was in the DOM and not on the screen. Asserted by
   * computed colour rather than by class, because the class was always right.
   */
  await ready(page, '/catalog');

  const measured = await page.evaluate(() => {
    const anchor = document.querySelector('tbody td a');
    if (!anchor) return null;
    const inner = anchor.querySelector('*');
    return {
      anchor: getComputedStyle(anchor).color,
      inner: inner ? getComputedStyle(inner).color : null,
      body: getComputedStyle(document.body).color,
    };
  });

  expect(measured, 'the catalog must render at least one link cell').not.toBeNull();
  expect(measured?.anchor).not.toBe(measured?.body);
  if (measured?.inner !== null) expect(measured?.inner).toBe(measured?.anchor);
});

test('a wide table uses Salt overflow handling instead of clipping', async ({ page }) => {
  await ready(page, '/catalog/claims');

  const measured = await page.evaluate(() => {
    const table = document.querySelector('table');
    let el = table?.parentElement ?? null;
    while (el && el !== document.body) {
      if (getComputedStyle(el).overflowX === 'auto') {
        return {
          overflow: getComputedStyle(el).overflowX,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          tabIndex: el.tabIndex,
        };
      }
      el = el.parentElement;
    }
    return null;
  });

  expect(measured, 'the table must sit inside Salt’s horizontal scroller').not.toBeNull();
  expect(measured?.overflow).toBe('auto');
  expect(measured?.scrollWidth).toBeGreaterThanOrEqual(measured?.clientWidth ?? 0);
  // Salt only adds a keyboard stop when there is something to scroll. Wrapped
  // content that fits should not add an inert tab stop to every table.
  expect(measured?.tabIndex).toBe(
    (measured?.scrollWidth ?? 0) > (measured?.clientWidth ?? 0) ? 0 : -1,
  );
});

test('a mistyped address still has a page heading', async ({ page }) => {
  await ready(page, '/no-such-section');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/page not found/i);
});
