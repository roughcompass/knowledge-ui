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

test('the breadcrumb starts the main content instead of occupying shell chrome', async ({
  page,
}) => {
  await ready(page, '/catalog/claims');

  const main = page.getByRole('main');
  const trail = main.getByRole('list', { name: 'Location' });
  await expect(trail).toBeVisible();
  await expect(page.getByRole('banner').getByRole('list', { name: 'Location' })).toHaveCount(0);

  const placement = await trail.evaluate((element) => {
    const mainElement = element.closest('main');
    const heading = mainElement?.querySelector('h1');
    if (!mainElement || !heading) return null;
    return {
      insideMain: mainElement.contains(element),
      abovePageTitle: element.getBoundingClientRect().bottom < heading.getBoundingClientRect().top,
    };
  });

  expect(placement).toEqual({ insideMain: true, abovePageTitle: true });
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

test('Context Testing is directly available from the dashboard and top-level rail', async ({
  page,
}) => {
  await ready(page, '/');

  const rail = page.locator(RAIL);
  // A section is a disclosure now, not a destination — its href used to duplicate
  // its own first child's.
  await expect(rail.getByRole('button', { name: 'Context Testing' })).toBeVisible();

  /*
    The card stopped being one big anchor when its pills became real links —
    anchors cannot nest — so the accessible link is now the title alone, with the
    description as the card's visible text beside it.
  */
  const dashboardEntry = page
    .getByRole('main')
    .getByRole('link', { name: 'Context Testing', exact: true });
  await expect(dashboardEntry).toBeVisible();
  await dashboardEntry.click();

  await expect(page).toHaveURL(/\/catalog\/context$/);
  await expect(page.getByRole('heading', { name: 'Retrieval Tests' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Retrieval Tests' })).toBeVisible();
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

test('section disclosures collapse without claiming the active state', async ({ page }) => {
  await ready(page, '/catalog/claims');

  const rail = page.locator(RAIL);
  const catalog = rail.getByRole('button', { name: 'Catalog' });

  await catalog.click();
  // A section only controls disclosure. It is not a destination and must not take
  // the active treatment from the navigable leaf it hides.
  await expect(rail.getByRole('link', { name: 'Claims' })).toHaveCount(0);
  await expect(catalog).toHaveAttribute('aria-expanded', 'false');
  await expect(catalog).not.toHaveAttribute('aria-current');
  await expect(rail.locator('[aria-current="page"]')).toHaveCount(0);

  const presentation = await catalog.evaluate((element) => ({
    insideActiveSurface: element.closest('.saltPanel') !== null,
    fontWeight: getComputedStyle(element.querySelector('.saltText') ?? element).fontWeight,
  }));
  expect(presentation).toEqual({ insideActiveSurface: false, fontWeight: '400' });

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
    const headerSurface = bar.querySelector('.saltPanel');
    return {
      railRight: Math.round(railBounds.right),
      railLeft: Math.round(railBounds.left),
      barLeft: Math.round(bar.getBoundingClientRect().left),
      barRight: Math.round(bar.getBoundingClientRect().right),
      barTop: Math.round(bar.getBoundingClientRect().top),
      barHeight: Math.round(bar.getBoundingClientRect().height),
      mainLeft: Math.round(main.getBoundingClientRect().left),
      shellLeft: Math.round(shellBounds.left),
      shellRight: Math.round(shellBounds.right),
      headerBackground: headerSurface ? getComputedStyle(headerSurface).backgroundColor : null,
      toolbarBorderStyle: toolbar ? getComputedStyle(toolbar).borderTopStyle : null,
    };
  });

  expect(bounds).not.toBeNull();
  expect(bounds?.shellLeft).toBe(0);
  expect(bounds?.barLeft).toBe(bounds?.shellLeft);
  expect(bounds?.barRight).toBe(bounds?.shellRight);
  expect(bounds?.barHeight).toBe(56);
  expect(bounds?.railLeft).toBe(0);
  expect(bounds?.mainLeft).toBeGreaterThanOrEqual(bounds?.railRight ?? 0);
  expect(bounds?.headerBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(bounds?.toolbarBorderStyle).toBe('none');

  await page.evaluate(() => window.scrollTo({ top: 600 }));
  const scrolled = await page.evaluate(() => {
    const bar = document.querySelector('header');
    const stickyRail = document.querySelector('nav')?.closest<HTMLElement>('.saltBorderItem');
    const menuScroller = document.querySelector<HTMLElement>('.saltSidePanelContent-body');
    if (!bar || !stickyRail || !menuScroller) return null;
    const barBounds = bar.getBoundingClientRect();
    const railBounds = stickyRail.getBoundingClientRect();
    const pageScroll = window.scrollY;
    menuScroller.scrollTop = 120;
    return {
      barTop: Math.round(barBounds.top),
      barBottom: Math.round(barBounds.bottom),
      railTop: Math.round(railBounds.top),
      railBottom: Math.round(railBounds.bottom),
      viewportBottom: window.innerHeight,
      overflow: getComputedStyle(menuScroller).overflowY,
      railScrollHeight: menuScroller.scrollHeight,
      railClientHeight: menuScroller.clientHeight,
      railScrollTop: menuScroller.scrollTop,
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

test('the rail follows the reference geometry and active item treatment', async ({ page }) => {
  await ready(page, '/');

  const measured = await page.evaluate(() => {
    const rail = document.querySelector('nav');
    const sidePanel = rail?.closest<HTMLElement>('.saltSidePanel');
    const active = rail?.querySelector<HTMLElement>('[aria-current="page"]');
    const activeSurface = active?.closest<HTMLElement>('.saltPanel');
    const icon = active?.querySelector('svg');
    if (!rail || !sidePanel || !active || !activeSurface || !icon) return null;
    const railBounds = rail.getBoundingClientRect();
    const sideBounds = sidePanel.getBoundingClientRect();
    const itemBounds = active.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    return {
      sideWidth: Math.round(sideBounds.width),
      sideTop: Math.round(sideBounds.top),
      railInset: Math.round(railBounds.left - sideBounds.left),
      itemWidth: Math.round(itemBounds.width),
      itemHeight: Math.round(itemBounds.height),
      iconLeft: Math.round(iconBounds.left - sideBounds.left),
      iconSize: Math.round(iconBounds.width),
      activeBackground: getComputedStyle(activeSurface).backgroundColor,
      activeWeight: getComputedStyle(active.querySelector('.saltText') ?? active).fontWeight,
    };
  });

  expect(measured).toEqual({
    sideWidth: 240,
    sideTop: 56,
    railInset: 16,
    itemWidth: 208,
    itemHeight: 48,
    iconLeft: 28,
    iconSize: 16,
    activeBackground: 'rgb(219, 245, 247)',
    activeWeight: '600',
  });
});

test('the tablet chrome uses the reference compact icon rail', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await ready(page, '/');

  const rail = page.locator('nav');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveCount(0);
  await expect(rail.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Catalog' })).toBeVisible();
  await expect(page.getByText('API ready', { exact: true })).toHaveCount(0);

  const measured = await page.evaluate(() => {
    const header = document.querySelector('header');
    const sidePanel = document.querySelector<HTMLElement>('.saltSidePanel');
    const main = document.querySelector('main');
    const startTooltray = header?.querySelector<HTMLElement>(
      '.saltToolbarContent[data-position="start"] .saltTooltray',
    );
    const centerTooltray = header?.querySelector<HTMLElement>(
      '.saltToolbarContent[data-position="center"] .saltTooltray',
    );
    const endTooltray = header?.querySelector<HTMLElement>(
      '.saltToolbarContent[data-position="end"] .saltTooltray',
    );
    if (!header || !sidePanel || !main || !startTooltray || !centerTooltray || !endTooltray)
      return null;
    return {
      headerHeight: Math.round(header.getBoundingClientRect().height),
      railWidth: Math.round(sidePanel.getBoundingClientRect().width),
      railTop: Math.round(sidePanel.getBoundingClientRect().top),
      mainLeft: Math.round(main.getBoundingClientRect().left),
      mainPaddingLeft: Math.round(Number.parseFloat(getComputedStyle(main).paddingLeft)),
      headerTooltraysOverlap:
        startTooltray.getBoundingClientRect().right > centerTooltray.getBoundingClientRect().left ||
        centerTooltray.getBoundingClientRect().right > endTooltray.getBoundingClientRect().left,
    };
  });

  expect(measured).toEqual({
    headerHeight: 56,
    railWidth: 72,
    railTop: 56,
    mainLeft: 72,
    mainPaddingLeft: 16,
    headerTooltraysOverlap: false,
  });
});

test('the mobile chrome is flush, contained, and opens the full navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/');

  const open = page.getByRole('button', { name: 'Open navigation' });
  await expect(open).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search from anywhere' })).toBeVisible();

  const measured = await page.evaluate(() => {
    const header = document.querySelector('header');
    const main = document.querySelector('main');
    if (!header || !main) return null;
    return {
      headerHeight: Math.round(header.getBoundingClientRect().height),
      mainLeft: Math.round(main.getBoundingClientRect().left),
      mainPaddingLeft: getComputedStyle(main).paddingLeft,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(measured).toEqual({
    headerHeight: 56,
    mainLeft: 0,
    mainPaddingLeft: '12px',
    scrollWidth: 390,
    viewportWidth: 390,
  });

  await open.click();
  const navigationDialog = page.getByRole('dialog', { name: 'Sections' });
  await expect(navigationDialog).toBeVisible();
  await expect(
    navigationDialog.getByRole('link', { name: 'Capabilities', exact: true }),
  ).toBeVisible();
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

test('page descriptions remain readable and visually attached to their titles', async ({
  page,
}) => {
  await ready(page, '/catalog/notifications');

  const heading = page.getByRole('heading', { level: 1, name: 'Notifications' });
  const measured = await heading.evaluate((element) => {
    const title = element.querySelector<HTMLElement>('.saltText');
    const titleGroup = element.parentElement;
    const description = titleGroup?.querySelector<HTMLElement>('.saltText-secondary');
    if (!title || !titleGroup || !description) return null;

    const headingBounds = element.getBoundingClientRect();
    const descriptionBounds = description.getBoundingClientRect();
    const headingStyle = getComputedStyle(element);
    const titleGroupStyle = getComputedStyle(titleGroup);
    const titleStyle = getComputedStyle(title);
    const descriptionStyle = getComputedStyle(description);

    return {
      headingMarginTop: headingStyle.marginTop,
      headingMarginBottom: headingStyle.marginBottom,
      layoutGap: titleGroupStyle.rowGap,
      titleFontSize: titleStyle.fontSize,
      descriptionFontSize: descriptionStyle.fontSize,
      descriptionLineHeight: descriptionStyle.lineHeight,
      titleDescriptionGap: Math.round(descriptionBounds.top - headingBounds.bottom),
    };
  });

  expect(measured).toEqual({
    headingMarginTop: '0px',
    headingMarginBottom: '0px',
    layoutGap: '0px',
    titleFontSize: '32px',
    descriptionFontSize: '16px',
    descriptionLineHeight: '21px',
    titleDescriptionGap: 0,
  });
});

test('standard content is centered at the harness width and contains mobile overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await ready(page, '/catalog/notifications');

  const desktop = await page
    .getByRole('heading', { level: 1, name: 'Notifications' })
    .evaluate((heading) => {
      const content = heading.closest<HTMLElement>('.saltGridItem');
      const frame = content?.parentElement;
      if (!content || !frame) return null;
      const contentBounds = content.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      return {
        width: Math.round(contentBounds.width),
        leftInset: Math.round(contentBounds.left - frameBounds.left),
        rightInset: Math.round(frameBounds.right - contentBounds.right),
      };
    });

  expect(desktop).toEqual({ width: 1200, leftInset: 216, rightInset: 216 });

  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/catalog/notifications');
  const mobile = await page.evaluate(() => {
    const heading = document.querySelector('h1');
    const table = document.querySelector('table');
    const scroller = table?.parentElement;
    if (!heading || !scroller) return null;
    const headingBounds = heading.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      headingRight: Math.round(headingBounds.right),
      scrollerOverflow: getComputedStyle(scroller).overflowX,
      tableIsScrollable: scroller.scrollWidth > scroller.clientWidth,
    };
  });

  expect(mobile).toEqual({
    documentWidth: 390,
    viewportWidth: 390,
    headingRight: 378,
    scrollerOverflow: 'auto',
    tableIsScrollable: true,
  });
});

test('card headings and actions share one aligned visual contract', async ({ page }) => {
  await ready(page, '/');

  const heading = page.getByRole('heading', { level: 2, name: 'Test context retrieval' });
  const measured = await heading.evaluate((element) => {
    const title = element.querySelector<HTMLElement>('.saltText');
    const titleGroup = element.parentElement;
    const description = titleGroup?.querySelector<HTMLElement>('.saltText-secondary');
    const header = titleGroup?.parentElement?.parentElement;
    const icon = header?.querySelector<HTMLElement>('.saltAvatar');
    const content = header?.nextElementSibling;
    const card = element.closest<HTMLElement>('.saltCard');
    const action = card?.querySelector<HTMLElement>('a');
    if (!title || !description || !header || !icon || !content || !card || !action) return null;

    const titleBounds = title.getBoundingClientRect();
    const descriptionBounds = description.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    const headerBounds = header.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const headingStyle = getComputedStyle(element);
    const titleStyle = getComputedStyle(title);
    const descriptionStyle = getComputedStyle(description);
    const actionStyle = getComputedStyle(action);
    const cardStyle = getComputedStyle(card);

    return {
      tagName: element.tagName,
      headingMarginTop: headingStyle.marginTop,
      headingMarginBottom: headingStyle.marginBottom,
      titleFontSize: titleStyle.fontSize,
      titleLineHeight: titleStyle.lineHeight,
      descriptionFontSize: descriptionStyle.fontSize,
      descriptionLineHeight: descriptionStyle.lineHeight,
      titleDescriptionGap: Math.round(descriptionBounds.top - titleBounds.bottom),
      iconTitleTopDelta: Math.round(iconBounds.top - titleBounds.top),
      layoutGap: getComputedStyle(card).rowGap,
      headerContentGap: Math.round(contentBounds.top - headerBounds.bottom),
      actionFontSize: actionStyle.fontSize,
      actionFontWeight: actionStyle.fontWeight,
      actionTextDecoration: actionStyle.textDecorationLine,
      actionHasIcon: action.querySelector('svg') !== null,
      cardPadding: cardStyle.paddingTop,
    };
  });

  expect(measured).toMatchObject({
    tagName: 'H2',
    headingMarginTop: '0px',
    headingMarginBottom: '0px',
    titleFontSize: '22px',
    titleLineHeight: '29px',
    descriptionFontSize: '16px',
    descriptionLineHeight: '21px',
    titleDescriptionGap: 0,
    iconTitleTopDelta: 0,
    layoutGap: '24px',
    actionFontSize: '14px',
    actionFontWeight: '600',
    actionTextDecoration: 'none',
    actionHasIcon: true,
    cardPadding: '24px',
  });
  expect(measured?.headerContentGap).toBeGreaterThanOrEqual(24);

  const actionTops = await Promise.all(
    ['Open Retrieval Tests', 'Open Graph', 'Open Workspaces'].map((name) =>
      page
        .getByRole('main')
        .getByRole('link', { name })
        .evaluate((element) => Math.round(element.getBoundingClientRect().top)),
    ),
  );
  expect(Math.max(...actionTops) - Math.min(...actionTops)).toBeLessThanOrEqual(1);
});

test('global search is centered in the header and opens a bounded result surface', async ({
  page,
}) => {
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
  await expect(
    page.getByRole('banner').getByRole('textbox', { name: 'Search from anywhere' }),
  ).toBeVisible();
  await expect(
    page.locator('nav').getByRole('textbox', { name: 'Search from anywhere' }),
  ).toHaveCount(0);
  await field.click();
  await field.type('sa', { delay: 40 });

  const heading = page.getByText('Search results', { exact: true });
  await expect(heading).toBeVisible();
  await expect(page.getByRole('link', { name: 'View all results' })).toBeVisible();
  await expect(page.getByText(/Relevance \d/).first()).toBeVisible();

  const hit = await heading.evaluate((title) => {
    const el = title.closest<HTMLElement>('.saltCard');
    const header = document.querySelector('header');
    const input = document.querySelector<HTMLInputElement>('[aria-label="Search from anywhere"]');
    const inputSurface = input?.closest<HTMLElement>('.saltInput');
    if (!el || !header || !inputSurface) return null;
    const r = el.getBoundingClientRect();
    const headerBounds = header.getBoundingClientRect();
    const fieldBounds = inputSurface.getBoundingClientRect();
    const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + 10);
    return {
      insideClippedBar: !!el.closest('header'),
      ownsItsPixels: el.contains(topmost),
      centerDelta: Math.round(
        fieldBounds.left + fieldBounds.width / 2 - (headerBounds.left + headerBounds.width / 2),
      ),
      panelWidth: Math.round(r.width),
      fieldWidth: Math.round(fieldBounds.width),
      panelCenterDelta: Math.round(
        r.left + r.width / 2 - (headerBounds.left + headerBounds.width / 2),
      ),
      borderStyle: getComputedStyle(el).borderTopStyle,
      dividerCount: el.querySelectorAll('.saltDivider').length,
    };
  });

  expect(hit, 'the suggestion panel must be in the document').not.toBeNull();
  expect(hit?.insideClippedBar).toBe(false);
  expect(hit?.ownsItsPixels).toBe(true);
  expect(hit?.centerDelta).toBe(0);
  expect(hit?.panelWidth).toBeGreaterThanOrEqual(hit?.fieldWidth ?? 0);
  expect(hit?.panelCenterDelta).toBe(0);
  expect(hit?.borderStyle).toBe('solid');
  expect(hit?.dividerCount).toBeGreaterThan(0);
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
