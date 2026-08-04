import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * The lint rules that hold a design decision together, asserted where they are
 * actually applied rather than where they are written.
 *
 * ESLint's flat config replaces a rule's options rather than merging them, so a
 * later block that names a rule silently discards every earlier entry for the
 * files it matches. Reading the config file cannot tell you what survived; only
 * resolving it per file can.
 *
 * That is not a hypothetical. It happened twice. The first time, a block scoped to
 * pages and components restated the banned-intrinsics selectors and dropped the
 * raw-hex ban with them, leaving hex colours unenforced in precisely the files
 * where somebody would type one. The fix was to restate the universal entries by
 * hand — which left the trap armed, and it caught `no-restricted-imports` next:
 * five package bans and the global-stylesheet ban were replaced by a single chart
 * rule for everything under `apps/` and `remotes/`, so CSS-in-JS was bannable only
 * in `packages/`, where nobody was going to write it.
 *
 * Both are now composed rather than restated, which removes the spelling that
 * caused it. This file is the check that the composition actually reaches the
 * files, because the failure is invisible in review: the config reads correctly at
 * every individual block, and the bug lives in the interaction between them.
 */

const repoRoot = new URL('../..', import.meta.url).pathname;

/** Every package that must be unimportable from any file in the repository. */
const BANNED_EVERYWHERE = [
  'styled-components',
  '@emotion/react',
  '@emotion/styled',
  'tailwindcss',
  '@salt-ds/lab',
];

/**
 * One file per configuration neighbourhood.
 *
 * The two `apps/`/`remotes/` entries are the ones that regressed, and the `.ts`
 * case is separate from the `.tsx` case on purpose: the intrinsic-element block
 * matches only `.tsx`, so a rule can be present in one and missing in its sibling.
 */
const SAMPLES = {
  shellComponent: 'apps/shell/src/App.tsx',
  shellModule: 'apps/shell/src/app/basename.ts',
  catalogPage: 'remotes/catalog/src/pages/CapabilityListPage.tsx',
  operationsPage: 'remotes/operations/src/pages/HealthPage.tsx',
  uiKitComponent: 'packages/ui-kit/src/DataTable.tsx',
  apiClientModule: 'packages/api-client/src/client.ts',
  shellEntry: 'apps/shell/src/main.tsx',
  remoteEntry: 'remotes/catalog/src/standalone.tsx',
} as const;

type SampleName = keyof typeof SAMPLES;

const eslint = new ESLint({ cwd: repoRoot });

async function rulesFor(sample: SampleName) {
  const config = await eslint.calculateConfigForFile(SAMPLES[sample]);
  return (config.rules ?? {}) as Record<string, unknown[] | undefined>;
}

function restrictedImportPaths(rules: Record<string, unknown[] | undefined>): string[] {
  const rule = rules['no-restricted-imports'];
  const options = (rule?.[1] ?? {}) as { paths?: { name: string }[] };
  return (options.paths ?? []).map((entry) => entry.name);
}

function restrictedImportPatternGroups(rules: Record<string, unknown[] | undefined>): string[][] {
  const rule = rules['no-restricted-imports'];
  const options = (rule?.[1] ?? {}) as { patterns?: { group: string[] }[] };
  return (options.patterns ?? []).map((entry) => entry.group);
}

function restrictedSyntaxSelectors(rules: Record<string, unknown[] | undefined>): string[] {
  const rule = rules['no-restricted-syntax'] ?? [];
  return rule.slice(1).map((entry) => (entry as { selector: string }).selector);
}

const everySample = Object.keys(SAMPLES) as SampleName[];

describe('no-restricted-imports, as resolved per file', () => {
  it.each(everySample)('bans every forbidden package in %s', async (sample) => {
    const paths = restrictedImportPaths(await rulesFor(sample));
    // toEqual on the sorted set rather than per-package containment: a diff that
    // names the missing package is what makes this failure diagnosable.
    expect([...paths].filter((name) => BANNED_EVERYWHERE.includes(name)).sort()).toEqual(
      [...BANNED_EVERYWHERE].sort(),
    );
  });

  it.each(['shellComponent', 'shellModule', 'catalogPage', 'operationsPage'] as SampleName[])(
    'still confines chart marks to the figure component in %s',
    async (sample) => {
      expect(restrictedImportPaths(await rulesFor(sample))).toContain('@knowledge-ui/ui-kit');
    },
  );

  it.each(['shellComponent', 'catalogPage', 'uiKitComponent', 'apiClientModule'] as SampleName[])(
    'allows only scoped stylesheets in %s',
    async (sample) => {
      expect(restrictedImportPatternGroups(await rulesFor(sample))).toContainEqual([
        '**/*.css',
        '!**/*.module.css',
      ]);
    },
  );

  it.each(['shellEntry', 'remoteEntry'] as SampleName[])(
    'lifts the stylesheet ban for %s without lifting the package bans',
    async (sample) => {
      /*
       * These entries load global theme and font CSS, which nothing scopes. They
       * are allowed the stylesheet and nothing else — the previous spelling turned
       * the whole rule off to get it, so the three files that import the most
       * third-party CSS were also the three where CSS-in-JS was permitted.
       */
      const rules = await rulesFor(sample);
      expect(restrictedImportPatternGroups(rules)).toEqual([]);
      expect(restrictedImportPaths(rules)).toEqual(expect.arrayContaining(BANNED_EVERYWHERE));
    },
  );
});

describe('no-restricted-syntax, as resolved per file', () => {
  const RAW_HEX = 'Literal[value=/^#(?:[0-9a-fA-F]{3}){1,2}$/]';
  const STYLE_PROP_LITERAL =
    'JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression > Property > :matches(Literal, TemplateLiteral[expressions.length=0])';

  it.each(everySample)('bans raw hex and style-prop literals in %s', async (sample) => {
    const selectors = restrictedSyntaxSelectors(await rulesFor(sample));
    expect(selectors).toContain(RAW_HEX);
    expect(selectors).toContain(STYLE_PROP_LITERAL);
  });

  it.each(['shellComponent', 'catalogPage', 'operationsPage', 'shellEntry'] as SampleName[])(
    'bans Salt-covered intrinsics in %s',
    async (sample) => {
      const selectors = restrictedSyntaxSelectors(await rulesFor(sample));
      expect(selectors).toContain('JSXOpeningElement[name.name="button"]');
      expect(selectors).toContain('JSXOpeningElement[name.name="table"]');
    },
  );

  it('leaves the ui-kit free to use raw intrinsics', async () => {
    /*
     * Not an omission. The kit is where the gaps in the design system get filled,
     * so it is the one place a raw element is the right answer — and asserting the
     * exemption keeps a future block from "fixing" it and breaking every component.
     */
    const selectors = restrictedSyntaxSelectors(await rulesFor('uiKitComponent'));
    expect(selectors).not.toContain('JSXOpeningElement[name.name="button"]');
  });
});
