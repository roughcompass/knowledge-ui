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
  { name: 'a', message: 'Use <Link> from @salt-ds/core, or <Link> from react-router-dom for routes.' },
  { name: 'table', message: 'Use <Table> from @salt-ds/core.' },
  { name: 'thead', message: 'Use <THead> from @salt-ds/core.' },
  { name: 'tbody', message: 'Use <TBody> from @salt-ds/core.' },
  { name: 'tr', message: 'Use <TR> from @salt-ds/core.' },
  { name: 'td', message: 'Use <TD> from @salt-ds/core.' },
  { name: 'th', message: 'Use <TH> from @salt-ds/core.' },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.gen.ts', '**/generated/**'] },

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
      'no-restricted-syntax': [
        'error',
        {
          // A style prop holding literals is a stylesheet in disguise, outside
          // the reach of stylelint's token allow-list. Custom styling belongs
          // in a colocated *.module.css where the token rule applies.
          selector:
            'JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression > Property > Literal',
          message:
            'No literal values in a style prop. Use a Salt layout component, or a colocated *.module.css using var(--salt-*) tokens.',
        },
        {
          // Salt tokens are the only sanctioned source of design values.
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3}){1,2}$/]',
          message: 'No raw hex colours. Use a var(--salt-*) token.',
        },
      ],

      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'styled-components', message: 'CSS-in-JS is not used here. Use a *.module.css with Salt tokens.' },
            { name: '@emotion/react', message: 'CSS-in-JS is not used here. Use a *.module.css with Salt tokens.' },
            { name: '@emotion/styled', message: 'CSS-in-JS is not used here. Use a *.module.css with Salt tokens.' },
            { name: 'tailwindcss', message: 'Utility CSS is not used here. Use Salt components and tokens.' },
            {
              name: '@salt-ds/lab',
              message:
                '@salt-ds/lab is alpha with no semver guarantee. Wrap it in packages/ui-kit and pin the exact version.',
            },
          ],
          patterns: [
            {
              group: ['**/*.css', '!**/*.module.css'],
              message:
                'Only *.module.css may be imported. Global theme CSS is imported by the shell entry and each remote standalone entry, which are exempt.',
            },
          ],
        },
      ],
    },
  },

  // Salt-covered intrinsics are banned in feature code. ui-kit is the one place
  // allowed to reach for raw elements, because that is where the gaps in the
  // design system get filled.
  {
    files: ['apps/**/*.tsx', 'remotes/**/*.tsx'],
    rules: {
      'react/no-unknown-property': 'off',
      'no-restricted-syntax': [
        'error',
        ...SALT_COVERED_ELEMENTS.map((el) => ({
          selector: `JSXOpeningElement[name.name="${el.name}"]`,
          message: `<${el.name}> is covered by Salt. ${el.message}`,
        })),
        {
          selector:
            'JSXAttribute[name.name="style"] > JSXExpressionContainer > ObjectExpression > Property > Literal',
          message:
            'No literal values in a style prop. Use a Salt layout component, or a colocated *.module.css using var(--salt-*) tokens.',
        },
      ],
    },
  },

  // Theme and font CSS is global by nature and belongs to exactly these entries.
  {
    files: ['apps/shell/src/main.tsx', 'remotes/*/src/standalone.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Node-side tooling.
  {
    files: ['scripts/**/*.mjs', '*.config.{ts,mjs}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-restricted-syntax': 'off', 'no-restricted-imports': 'off' },
  },
);
