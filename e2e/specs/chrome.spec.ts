import { expect, test, type Page } from '@playwright/test';

/**
 * The application chrome: the drill-down rail, its back control, the resize handle,
 * and the two rules that have to line up.
 *
 * Separate from `a11y.spec.ts` because these are behavioural rather than
 * axe-driven. Every assertion here corresponds to a defect that shipped at some
 * point in this work:
 *
 *   - the drilled panel used to be derived from click state, so a deep link opened
 *     with the wrong panel;
 *   - the back control announced "Back to Operations" while navigating to `/`;
 *   - the rail header was 49px against a 67px top bar, so the two hairlines
 *     bracketing the chrome sat 18px apart;
 *   - the resize handle's visible mark filled its whole 12px hit area.
 */

const RAIL = 'nav';

async function ready(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();
}

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

test('the rail header and the top bar are the same height', async ({ page }) => {
  await ready(page, '/catalog');

  const bounds = await page.evaluate(() => {
    const bar = document.querySelector('header');
    // The rail's divided header zone: the only element above the nav carrying a
    // bottom rule.
    const zone = [...document.querySelectorAll('div')].find((d) =>
      /zoneDivided/.test(typeof d.className === 'string' ? d.className : ''),
    );
    if (!bar || !zone) return null;
    return {
      barBottom: Math.round(bar.getBoundingClientRect().bottom),
      zoneBottom: Math.round(zone.getBoundingClientRect().bottom),
    };
  });

  expect(bounds).not.toBeNull();
  // The two rules bracket the chrome across the full window width. A one-pixel
  // difference is visible as a step where they meet.
  expect(bounds?.barBottom).toBe(bounds?.zoneBottom);
});

test('the resize handle is operable from the keyboard and persists', async ({ page }) => {
  await ready(page, '/catalog');

  const handle = page.getByRole('separator', { name: 'Resize navigation' });
  await expect(handle).toHaveAttribute('aria-valuenow', /\d+/);

  const before = Number(await handle.getAttribute('aria-valuenow'));
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  const after = Number(await handle.getAttribute('aria-valuenow'));
  expect(after).toBeGreaterThan(before);

  // Survives a reload, which is the whole point of persisting it.
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('separator', { name: 'Resize navigation' })).toHaveAttribute(
    'aria-valuenow',
    String(after),
  );
});

test('the resize handle clamps rather than collapsing the rail', async ({ page }) => {
  await ready(page, '/catalog');

  const handle = page.getByRole('separator', { name: 'Resize navigation' });
  const min = Number(await handle.getAttribute('aria-valuemin'));
  await handle.focus();

  // Far more presses than the range needs. Without clamping the rail would pass
  // through zero and the nav labels would be unreachable with no way back.
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowLeft');
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(min);

  const railWidth = await page.locator(RAIL).evaluate((el) => {
    const rail = el.parentElement;
    return rail ? Math.round(rail.getBoundingClientRect().width) : 0;
  });
  expect(railWidth).toBeGreaterThanOrEqual(min);
});

test('the resize mark is a hairline, not the width of its hit area', async ({ page }) => {
  await ready(page, '/catalog');

  const measured = await page.evaluate(() => {
    const el = document.querySelector('[role="separator"]');
    if (!el) return null;
    return {
      hit: Math.round(el.getBoundingClientRect().width),
      mark: getComputedStyle(el, '::after').width,
    };
  });

  expect(measured).not.toBeNull();
  // A one-pixel target is unusable with a pointer, so the hit area is wide — but
  // filling it drew a 12px bar on hover.
  expect(measured?.hit).toBeGreaterThan(4);
  expect(measured?.mark).toBe('1px');
});

test('a column that opts into wrapping actually wraps', async ({ page }) => {
  /*
   * The cells-hold-their-line rule is a compound selector carrying a class and an
   * element, so the plain `.wrap` opt-out lost to it: the class landed on the cell
   * and the text still ran off the side. A claims table that should have measured
   * 1369px measured 1841px against a 1198px column, hiding four of its eight
   * columns behind a scroll nobody had reason to attempt.
   *
   * jsdom computes no styles, and stylelint checks form rather than effect, so
   * neither lane can see this. It is the same failure numeric alignment had.
   */
  await ready(page, '/catalog/claims');

  const measured = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('td')];
    const wrapped = cells.find((td) => [...td.classList].some((c) => c.includes('wrap')));
    const plain = cells.find((td) => ![...td.classList].some((c) => c.includes('wrap')));
    return {
      wrapped: wrapped ? getComputedStyle(wrapped).whiteSpace : null,
      plain: plain ? getComputedStyle(plain).whiteSpace : null,
    };
  });

  expect(measured.wrapped, 'a wrapping column must exist on this page').not.toBeNull();
  expect(measured.wrapped).toBe('normal');
  expect(measured.plain).toBe('nowrap');
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

  const hit = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      (d) => typeof d.className === 'string' && d.className.includes('panel'),
    );
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

test('a table wider than its column scrolls instead of clipping', async ({ page }) => {
  // Eight columns do not fit a 1200px measure at any type size. The answer is a
  // scroller the keyboard can reach, not columns that silently leave the page.
  await ready(page, '/catalog/claims');

  const measured = await page.evaluate(() => {
    const table = document.querySelector('table');
    let el = table?.parentElement ?? null;
    while (el && el !== document.body) {
      if (getComputedStyle(el).overflowX === 'auto') {
        return { overflows: el.scrollWidth > el.clientWidth, tabIndex: el.tabIndex };
      }
      el = el.parentElement;
    }
    return null;
  });

  expect(measured, 'the table must sit inside a horizontal scroller').not.toBeNull();
  expect(measured?.overflows).toBe(true);
  expect(measured?.tabIndex).toBe(0);
});

test('a mistyped address still has a page heading', async ({ page }) => {
  await ready(page, '/no-such-section');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/page not found/i);
});
