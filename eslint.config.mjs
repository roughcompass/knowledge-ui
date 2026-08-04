import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * The Salt-only rules below are the interesting part of this file. They exist
 * because "use the design system" is not enforceable by review alone — the
 * failure mode is a slow drift of one-off divs and hardcoded pixel values that
 * nobody notices until the theme changes and half the app does not follow.
 */

/** Intrinsic elements Salt already covers. Using them bypasses the design system. */
const SALT_COVERED_ELEMENTS = [
  { name: 'h1', message: 'Use <Text styleAs="h1"> from @salt-ds/core.' },
  { name: 'h2', message: 'Use <Text styleAs="h2"> from @salt-ds/core.' },
  { name: 'h3', message: 'Use <Text styleAs="h3"> from @salt-ds/core.' },
  { name: 'h4', message: 'Use <Text styleAs="h4"> from @salt-ds/core.' },
  { name: 'p', message: 'Use <Text> from @salt-ds/core.' },
  { name: 'button', message: 'Use <Button> from @salt-ds/core.' },
  { name: 'input', message: 'Use <Input> / <Checkbox> / <RadioButton> from @salt-ds/core.' },
  { name: 'select', message: 'Use <Dropdown> or <ComboBox> from @salt-ds/core.' },
  {
    name: 'a',
    message: 'Use <Link> from @salt-ds/core, or <Link> from react-router-dom for routes.',
  },
  { name: 'table', message: 'Use <Table> from @salt-ds/core.' },
  { name: 'thead', message: 'Use <THead> from @salt-ds/core.' },
  { name: 'tbody', message: 'Use <TBody> from @salt-ds/core.' },
  { name: 'tr', message: 'Use <TR> from @salt-ds/core.' },
  { name: 'td', message: 'Use <TD> from @salt-ds/core.' },
  { name: 'th', message: 'Use <TH> from @salt-ds/core.' },
];

/**
 * The two design rules that must hold in *every* file.
 *
 * Shared as constants because `no-restricted-syntax` takes an array and a later
 * config block replaces that array wholesale rather than merging into it. The
 * `apps/**` + `remotes/**` block below listed the intrinsic-element selectors and
 * silently dropped the hex ban with them — so raw hex colours were unenforced in
 * every page and component, which is precisely where they would be written.
 *
 * Restating the universal entries by hand fixed that instance and left the trap
 * armed: the same mistake then happened to `no-restricted-imports`, where a
 * narrow block for `apps/**` and `remotes/**` replaced five library bans and the
 * global-CSS ban with a single chart rule. Those bans were dead in every page and
 * component for as long as the rule existed, enforced only in `packages/`, which
 * is where they mattered least.
 *
 * So neither rule is written as a literal array anywhere below. Both are built by
 * the composer functions further down, which always include the universal set.
 * Adding a block cannot silently narrow either rule, because there is no longer a
 * spelling of them that omits the base — and `resolved-config.test.ts` asserts the
 * result per workspace, since a convention this file cannot enforce about itself
 * is the thing that failed twice.
 */
const NO_RAW_HEX = {
  // Salt tokens are the only sanctioned source of design values.
  selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3}){1,2}$/]',
  message: 'No raw hex colours. Use a var(--salt-*) token.',
};

const NO_STYLE_PROP_LITERALS = {
  /*
   * Matches a plain string/number literal and a template literal with no
   * interpolation — `style={{ padding: '8px' }}` and `style={{ padding: `8px` }}`
   * are the same mistake, and only the first was caught before.
   *
   * A template literal *with* expressions is allowed on purpose: a value computed
   * at runtime cannot live in a stylesheet, which is the one legitimate reason to
   * write a style prop at all.
   */
  selector:
    'JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression > Property > :matches(Literal, TemplateLiteral[expressions.length=0])',
  message:
    'No literal values in a style prop. Use a Salt layout component, or a colocated *.module.css using var(--salt-*) tokens.',
};

/** Packages that must never appear in an import, anywhere. */
const BANNED_PACKAGES = [
  {
    name: 'styled-components',
    message: 'CSS-in-JS is not used here. Use a *.module.css with Salt tokens.',
  },
  {
    name: '@emotion/react',
    message: 'CSS-in-JS is not used here. Use a *.module.css with Salt tokens.',
  },
  {
    name: '@emotion/styled',
    message: 'CSS-in-JS is not used here. Use a *.module.css with Salt tokens.',
  },
  {
    name: 'tailwindcss',
    message: 'Utility CSS is not used here. Use Salt components and tokens.',
  },
  {
    name: '@salt-ds/lab',
    message:
      '@salt-ds/lab is alpha with no semver guarantee. Wrap it in packages/ui-kit and pin the exact version.',
  },
];

/**
 * Only scoped stylesheets may be imported.
 *
 * The three entry files that pull in global theme and font CSS pass
 * `globalCss: 'allowed'` to the composer below. They are the only files that
 * legitimately load a stylesheet nothing scopes, and they used to switch the whole
 * rule off to get it — which took the package bans with them.
 */
const ONLY_CSS_MODULES = {
  group: ['**/*.css', '!**/*.module.css'],
  message:
    'Only *.module.css may be imported. Global theme CSS is imported by the shell entry and each remote standalone entry, which are exempt.',
};

/**
 * Builds a complete `no-restricted-imports` value.
 *
 * Every caller gets `BANNED_PACKAGES`; there is deliberately no way to ask for a
 * value without them. `paths` adds block-specific bans on top, and
 * `globalCss: 'allowed'` drops only the stylesheet pattern rather than the lot.
 */
const restrictedImports = ({ paths = [], globalCss = 'banned' } = {}) => [
  'error',
  {
    paths: [...BANNED_PACKAGES, ...paths],
    patterns: globalCss === 'allowed' ? [] : [ONLY_CSS_MODULES],
  },
];

/**
 * Comparing a session's role to a literal, outside the package that owns roles.
 *
 * The capability table exists so a screen asks `can(session, 'adoption:write')`
 * and never names a role — that indirection is what lets a gate move without
 * touching a component, and the table is the only place the server's real gates
 * are documented and tested against the API document. A literal in a component
 * records the same rule in a second place and checks it in neither.
 *
 * It had happened twice: an adoption control comparing against producer and
 * admin, and a page branching on "not the auditor role". Both were correct and
 * both were unreachable by the parity test.
 *
 * Narrow on purpose — it matches a comparison against `.role`, not the word
 * "role" anywhere. `packages/auth` is exempt because that is where the table and
 * its own tests live.
 */
const NO_ROLE_LITERALS = {
  selector:
    'BinaryExpression[operator=/^[!=]==?$/]:has(MemberExpression[property.name="role"]):has(Literal[value=/^(admin|producer|consumer|auditor)$/])',
  message:
    "Do not compare a role to a literal. Ask the capability table instead: can(session, '<capability>'). It mirrors what the API enforces and is tested against the API document; a role name here is a second copy of that rule with no test.",
};

/** Builds a complete `no-restricted-syntax` value, universal selectors included. */
const restrictedSyntax = (...additional) => [
  'error',
  NO_STYLE_PROP_LITERALS,
  NO_RAW_HEX,
  ...additional,
];

export default tseslint.config(
  // Kept in step with .gitignore. `dist-types/` in particular is declaration
  // output the federation plugin writes beside `dist/`, and linting generated
  // `.d.ts` files reports style violations against code nobody wrote or edits.
  {
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/blob-report/**',
      '**/*.gen.ts',
      '**/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // --- Salt-only enforcement -------------------------------------------
      // A style prop holding literals is a stylesheet in disguise, outside the
      // reach of stylelint's token allow-list. Custom styling belongs in a
      // colocated *.module.css where the token rule applies.
      'no-restricted-syntax': restrictedSyntax(),

      'no-restricted-imports': restrictedImports(),
    },
  },

  // Salt-covered intrinsics are banned in feature code. ui-kit is the one place
  // allowed to reach for raw elements, because that is where the gaps in the
  // design system get filled.
  {
    files: ['apps/**/*.tsx', 'remotes/**/*.tsx'],
    rules: {
      'no-restricted-syntax': restrictedSyntax(
        ...SALT_COVERED_ELEMENTS.map((el) => ({
          selector: `JSXOpeningElement[name.name="${el.name}"]`,
          message: `<${el.name}> is covered by Salt. ${el.message}`,
        })),
        NO_ROLE_LITERALS,
      ),
    },
  },

  /*
   * The role rule again for non-component files under apps/ and remotes/, which
   * the .tsx-only block above cannot reach. Hooks and route guards are exactly
   * where a role comparison would otherwise hide.
   */
  {
    files: ['apps/**/*.ts', 'remotes/**/*.ts'],
    rules: { 'no-restricted-syntax': restrictedSyntax(NO_ROLE_LITERALS) },
  },

  /*
   * A chart may only be rendered through `Figure`, which pairs it with the table
   * it was drawn from.
   *
   * `Figure` on its own is a convention, and a convention is what the next page
   * under deadline quietly skips — it is one import away from rendering `BarSeries`
   * with no table, and nothing would have failed. This rule is what makes the
   * pairing a constraint: outside ui-kit the marks are unimportable, so the only
   * route to a chart is the one that carries its data with it.
   *
   * Deliberately narrow. It names the two mark exports rather than banning `<svg>`
   * wholesale, because a rule that fires on an icon or a logo would be turned off
   * within a week and take the real constraint with it.
   */
  {
    files: ['remotes/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrictedImports({
        paths: [
          {
            name: '@knowledge-ui/ui-kit',
            importNames: ['BarSeries', 'Sparkline'],
            message:
              'Render a chart through <Figure>, which pairs the mark with its data table. Importing a mark directly makes the table optional, and a chart without one is unreadable to anyone who cannot see it — and uncheckable by anyone who can.',
          },
        ],
      }),
    },
  },

  /*
   * Theme and font CSS is global by nature and belongs to exactly these entries.
   *
   * Only the stylesheet pattern is lifted. This block used to switch the whole
   * rule off, which also un-banned CSS-in-JS and the alpha component package in
   * the three files nothing else covers.
   */
  {
    files: ['apps/shell/src/main.tsx', 'remotes/*/src/standalone.tsx'],
    rules: { 'no-restricted-imports': restrictedImports({ globalCss: 'allowed' }) },
  },

  // Node-side tooling.
  {
    files: ['scripts/**/*.mjs', '*.config.{ts,mjs}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-imports': 'off' },
  },
);
