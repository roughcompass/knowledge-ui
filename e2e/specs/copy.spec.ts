import { expect, test, type Page } from '@playwright/test';

/**
 * The copy rules that a machine can actually check.
 *
 * The design standard is mostly agreement — no rule can tell whether a button's noun
 * is the *right* noun. But two of its rules are shape, not judgement: a button label
 * is Title Case, and a table header is a Title Case noun rather than a sentence. Both
 * have now drifted twice, in both directions, on pages nobody happened to reopen.
 *
 * So they get asserted here rather than left as a paragraph in a document. This is
 * the only lane that can: the labels are strings scattered across two remotes and a
 * host, some are conditional on a role or on form state, and the rule is about what
 * reaches the screen — which no lint rule sees and no component test enumerates.
 *
 * Deliberately narrow. It checks case and articles and nothing else, because
 * everything past that is taste, and a guard that pretends otherwise starts getting
 * disabled.
 */

const ROUTES = [
  '/',
  '/catalog',
  '/catalog?q=ledger',
  '/catalog/salt-design-system',
  '/catalog/salt-design-system/interface',
  '/catalog/salt-design-system/impact',
  '/catalog/claims',
  '/catalog/context',
  '/catalog/context/receipts',
  '/catalog/notifications',
  '/ops',
  '/ops/metrics',
  '/ops/usage',
  '/ops/audit',
  '/ops/sync',
  '/ops/sync/runs',
];

/**
 * Words allowed to stay lowercase inside a Title Case label.
 *
 * The conventional set: articles, coordinating conjunctions and short prepositions,
 * which Title Case leaves alone anywhere but the first word — "Back to Catalog",
 * "Subscribe to Changes".
 */
const MINOR_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'by',
  'with',
  'as',
  'at',
  'from',
]);

function offence(label: string): string | null {
  const words = label.split(/\s+/).filter((word) => /[a-zA-Z]/.test(word));
  if (words.length === 0) return null;

  // A count baked into a label — "Mark 2 Read" — is fine and must not read as a
  // lowercase word.
  const firstWord = words[0] ?? '';
  if (/^[a-z]/.test(firstWord)) return 'starts lowercase';

  const lowercased = words
    .slice(1)
    .filter((word) => /^[a-z]/.test(word) && !MINOR_WORDS.has(word.toLowerCase()));
  if (lowercased.length > 0) return `lowercase word "${lowercased[0]}"`;

  /*
   * An article inside a label is the tell for sentence case that slipped through
   * capitalisation — "Add a source" became "Add a Source" rather than "Add Source"
   * the first time this was corrected by eye. The noun does not need one.
   */
  const article = words
    .slice(1)
    .find((word) => ['a', 'an', 'the'].includes(word.toLowerCase().replace(/\W/g, '')));
  if (article !== undefined) return `article "${article}" — the noun does not need one`;

  return null;
}

/** Admin, so the gated pages render their controls instead of a refusal. */
async function asAdmin(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('main')).toBeVisible();
  await page.getByRole('combobox', { name: 'Signed in as' }).click();
  await page.getByRole('option', { name: /admin/i }).first().click();
  await expect(page.getByText('admin', { exact: true }).first()).toBeVisible();
}

test('every button label is Title Case', async ({ page }) => {
  await asAdmin(page);

  const offences: string[] = [];
  const checked = new Set<string>();

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.getByRole('main')).toBeVisible();

    // Scoped to `main`: the rail and the top bar hold navigation and a persona
    // switcher, whose labels are names and destinations rather than actions.
    for (const text of await page.locator('main').getByRole('button').allTextContents()) {
      const label = text.trim();
      if (label === '' || checked.has(label)) continue;
      checked.add(label);

      const problem = offence(label);
      if (problem !== null) offences.push(`${route} — "${label}": ${problem}`);
    }
  }

  expect(checked.size, 'the sweep must actually find buttons').toBeGreaterThan(10);
  expect(offences, `Button labels are Title Case verb-plus-noun:\n${offences.join('\n')}`).toEqual(
    [],
  );
});

test('every table header is a Title Case noun, not a sentence', async ({ page }) => {
  await asAdmin(page);

  const offences: string[] = [];
  const checked = new Set<string>();

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.getByRole('main')).toBeVisible();

    for (const text of await page.getByRole('columnheader').allTextContents()) {
      const label = text.trim();
      if (label === '' || checked.has(label)) continue;
      checked.add(label);

      /*
       * `p95` and `Worst Daily p95` are the deliberate exception: it is a statistical
       * notation and capitalising it to "P95" would be wrong rather than tidier. The
       * rest of the label is still checked.
       */
      const problem = offence(label.replace(/\bp\d{1,3}\b/g, 'Percentile'));
      if (problem !== null) offences.push(`${route} — "${label}": ${problem}`);

      // A header is a noun phrase. A full stop means a sentence got in.
      if (label.endsWith('.')) offences.push(`${route} — "${label}": is a sentence`);
    }
  }

  expect(checked.size, 'the sweep must actually find headers').toBeGreaterThan(10);
  expect(offences, `Table headers are Title Case nouns:\n${offences.join('\n')}`).toEqual([]);
});

test('no table cell renders a bare identifier', async ({ page }) => {
  /*
   * Nine surfaces used to answer "which one" with a bare thirty-six-character UUID
   * and no destination — the impact panel's related-entity column, every claim's
   * subject, the usage and audit tables, a workspace entry's references. Those are
   * the places a reader is most likely to want to go next, and none of them went
   * anywhere or could be told apart at a glance.
   *
   * A reference now renders as a name where one is known, and otherwise as the first
   * eight characters with the whole value in a tooltip and a copy control. So a full
   * UUID standing alone as a cell's text is the regression, and this is the shape of
   * it rather than a list of the nine places it happened to be.
   */
  await asAdmin(page);

  const offences: string[] = [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.getByRole('main')).toBeVisible();

    for (const text of await page.locator('td').allInnerTexts()) {
      const value = text.trim();
      if (uuid.test(value)) offences.push(`${route}: ${value}`);
    }
  }

  expect(offences, `Bare identifiers in table cells:\n  ${offences.join('\n  ')}`).toEqual([]);
});
