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

test('the rail drills into a section and replaces its own contents', async ({ page }) => {
  await ready(page, '/');

  const rail = page.locator(RAIL);
  await expect(rail.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Operations' })).toBeVisible();

  await rail.getByRole('link', { name: 'Operations' }).click();
  await expect(page).toHaveURL(/\/ops$/);

  // The section's pages replace the top-level list rather than nesting under it.
  await expect(rail.getByRole('link', { name: 'Metrics' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Capabilities' })).toHaveCount(0);
});

test('the drilled panel is derived from the route, not from click state', async ({ page }) => {
  // Straight to a child route with no clicks. The panel has to open already drilled,
  // or a pasted link lands with the rail describing somewhere else.
  await ready(page, '/ops/metrics');

  const rail = page.locator(RAIL);
  await expect(rail.getByRole('link', { name: 'Health' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Capabilities' })).toHaveCount(0);
});

test('the back control names and reaches its actual destination', async ({ page }) => {
  await ready(page, '/ops/metrics');

  // Announced with the direction, because the chevron is hidden from assistive
  // technology and the text alone would read as a link *to* the destination.
  const back = page.locator(RAIL).getByRole('link', { name: /back to overview/i });
  await expect(back).toBeVisible();

  await back.click();
  await expect(page).toHaveURL(/\/$/);
  // Back out of a section restores the top-level list.
  await expect(page.locator(RAIL).getByRole('link', { name: 'Capabilities' })).toBeVisible();
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

test('a mistyped address still has a page heading', async ({ page }) => {
  await ready(page, '/no-such-section');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/page not found/i);
});
