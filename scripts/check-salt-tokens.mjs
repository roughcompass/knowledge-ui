#!/usr/bin/env node
/**
 * Assert that every `var(--salt-*)` in our stylesheets actually resolves.
 *
 * This exists because of a bug that shipped. `RetrievalArmsBar.module.css` asked
 * for `--salt-category-40-foreground` with `--salt-status-info-foreground` as a
 * fallback. Neither name exists under `theme-next`: the categorical palette runs
 * 1–20, and the bare `-foreground` status form belongs to the *legacy* theme,
 * which this app deliberately does not load. When a token and its fallback are
 * both undefined the whole declaration is invalid at computed-value time, so
 * `background` fell back to `transparent` and two of the three series in a chart
 * rendered invisible. It looked like an ordinary progress bar.
 *
 * Nothing caught it. Stylelint's `declaration-property-value-allowed-list`
 * checks that a value *starts with* `var(--salt-` — it has no idea whether the
 * token exists. TypeScript never sees CSS. The build succeeded. The only signal
 * was a chart that looked plausible and was wrong.
 *
 * Two classes of failure are reported, and the second is the subtle one:
 *
 *   UNDEFINED   — no theme defines this name. A typo, or a token that was
 *                 removed, or one that never existed.
 *   LEGACY-ONLY — defined in `theme.css` but not in `theme-next.css`. This is the
 *                 dangerous case: the name looks right, it is real, it is
 *                 documented, and it resolves to nothing in the theme we ship.
 *
 * ## The third check: the app's own named roles
 *
 * This app defines a small bridge of `--kui-*` properties that name a *role* — the
 * radius of a modal, say — so a component picks by meaning rather than copying
 * whatever value its neighbour used. Stylelint's allow-list permits them, which
 * would otherwise be a hole straight through the token rule: `--kui-radius-modal:
 * 13px` would satisfy every check while being exactly the magic value the rule
 * exists to forbid.
 *
 * So each one must be *defined* as a single `var(--salt-*)` reference and nothing
 * else. The bridge can rename a Salt token; it cannot invent a value.
 *
 *   BRIDGE      — a `--kui-*` property whose definition is not a lone Salt token.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME = join(ROOT, 'node_modules', '@salt-ds', 'theme', 'css');

/** Custom properties a stylesheet *defines* (`--salt-foo: value`). */
function definedIn(file) {
  const out = new Set();
  const css = readFileSync(file, 'utf8');
  for (const m of css.matchAll(/(--salt-[a-zA-Z0-9-]+)\s*:/g)) out.add(m[1]);
  return out;
}

/**
 * The app's own named roles, with whatever each is defined as.
 *
 * Comments blanked first, for the reason `referencedIn` explains: a paragraph
 * describing a past mistake must not be read as the mistake.
 */
function bridgeDefinitions(file) {
  const out = [];
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.replace(/[^\n]/g, ' '),
  );
  css.split('\n').forEach((line, i) => {
    const m = /(--kui-[a-zA-Z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (m) out.push({ name: m[1], value: m[2].trim(), line: i + 1 });
  });
  return out;
}

/** A definition that renames exactly one Salt token, and does nothing else. */
const RENAMES_ONE_SALT_TOKEN = /^var\(\s*--salt-[a-zA-Z0-9-]+\s*\)$/;

/**
 * Custom properties a stylesheet *reads* (`var(--salt-foo)`), fallbacks included.
 *
 * Comments are blanked first, line count preserved so reported line numbers stay
 * true. Without that, a comment explaining a past token mistake trips the check
 * that exists because of it — which is exactly what happened here, and is the
 * same trap as a security grep matching the paragraph describing the leak.
 */
function referencedIn(file) {
  const out = new Map();
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.replace(/[^\n]/g, ' '),
  );
  css.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--salt-[a-zA-Z0-9-]+)/g)) {
      if (!out.has(m[1])) out.set(m[1], i + 1);
    }
  });
  return out;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-types') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    // Every stylesheet, not just the CSS modules. `theme-fixups.css` is a global
    // sheet and was the one file in the repo that neither this guard nor stylelint
    // looked at — which is exactly where a dangling token would survive longest,
    // since it is the file that exists to repair dangling tokens.
    else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}

// The theme the app actually loads: `global.css` + `theme-next.css`, and nothing
// else. Mirrors apps/shell/src/main.tsx exactly — if that import list changes,
// this list has to change with it.
const next = new Set([
  ...definedIn(join(THEME, 'global.css')),
  ...definedIn(join(THEME, 'theme-next.css')),
]);
const legacy = definedIn(join(THEME, 'theme.css'));

const sheets = walk(ROOT).sort();
let failures = 0;
let checked = 0;

let bridged = 0;

for (const sheet of sheets) {
  const rel = relative(ROOT, sheet);

  for (const { name, value, line } of bridgeDefinitions(sheet)) {
    bridged++;
    if (RENAMES_ONE_SALT_TOKEN.test(value)) continue;
    failures++;
    console.error(
      `  BRIDGE      — a named role must be one Salt token and nothing else\n    ${rel}:${line}  ${name}: ${value}`,
    );
  }

  for (const [token, line] of referencedIn(sheet)) {
    checked++;
    if (next.has(token)) continue;
    failures++;
    const why = legacy.has(token)
      ? 'LEGACY-ONLY — defined in theme.css, absent from theme-next.css'
      : 'UNDEFINED   — no Salt theme defines this token';
    console.error(`  ${why}\n    ${rel}:${line}  ${token}`);
  }
}

if (failures > 0) {
  console.error(
    `\ncheck-salt-tokens: FAIL (${failures} unresolvable of ${checked} references in ${sheets.length} stylesheets)`,
  );
  console.error('A var() whose token and fallback are both undefined renders as nothing at all.');
  process.exit(1);
}

console.log(
  `check-salt-tokens: PASS (${checked} token references and ${bridged} named roles in ${sheets.length} stylesheets all resolve under theme-next)`,
);
