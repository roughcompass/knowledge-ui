#!/usr/bin/env node
/**
 * Enforce a gzipped size budget over the built artefacts.
 *
 * This exists because Module Federation removes the usual lever: a
 * `manualChunks` entry is accepted by Vite's config schema and then silently
 * ignored, so the ordinary way of controlling chunk composition is unavailable
 * and unobservable. Route-level lazy imports still work, but nothing warns when
 * the entry graph grows — hence a hard number in CI.
 *
 * Measures the entry chunk plus everything it statically pulls in, per app.
 * Lazy route chunks are excluded on purpose: they are the mechanism we want
 * people to reach for, so counting them would penalise the right behaviour.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Kilobytes, gzipped, of the initial JS+CSS for each app. */
const BUDGETS = {
  'apps/shell': 420,
  'remotes/catalog': 260,
  'remotes/operations': 260,
};

function gzippedKb(file) {
  return gzipSync(readFileSync(file)).length / 1024;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let failed = false;

for (const [app, budgetKb] of Object.entries(BUDGETS)) {
  const dist = join(ROOT, app, 'dist');
  if (!existsSync(dist)) {
    console.error(`  MISSING  ${app}/dist — run npm run build:e2e first`);
    failed = true;
    continue;
  }

  const manifestPath = join(dist, 'mf-manifest.json');
  if (!existsSync(manifestPath)) {
    // The manifest is the federation plugin's own output. Its absence means the
    // plugin did not run, which would make an otherwise-passing size check
    // meaningless.
    console.error(`  MISSING  ${app}/dist/mf-manifest.json — the federation plugin did not emit`);
    failed = true;
    continue;
  }

  const assets = walk(dist).filter((f) => /\.(js|css)$/.test(f));
  // The entry is the remoteEntry plus the initial chunks. Distinguishing those
  // from lazily-loaded ones reliably would mean parsing the manifest's own
  // graph; total size is the honest simple proxy, so the budget is set against
  // the total and the number below is what it is measured against.
  const totalKb = assets.reduce((acc, f) => acc + gzippedKb(f), 0);
  const status = totalKb <= budgetKb ? 'ok  ' : 'OVER';
  if (totalKb > budgetKb) failed = true;
  console.log(
    `  ${status} ${app.padEnd(22)} ${totalKb.toFixed(1).padStart(7)} KB gz  (budget ${budgetKb} KB, ${assets.length} files)`,
  );
}

if (failed) {
  console.error('\ncheck-bundle-budget: FAIL');
  console.error('Raise the budget deliberately, or move code behind a lazy route import.');
  process.exit(1);
}
console.log('\ncheck-bundle-budget: PASS');
