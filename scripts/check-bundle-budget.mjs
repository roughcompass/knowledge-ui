#!/usr/bin/env node
/**
 * Size budget over the built artefacts, plus a share-contract check read off
 * those same artefacts.
 *
 * A budget exists here because Module Federation removes the usual lever: a
 * `manualChunks` entry is accepted by Vite's config schema and then silently
 * ignored, so the ordinary way of shaping chunks is both unavailable and
 * unobservable. Route-level lazy imports still work, but nothing warns when the
 * entry graph grows.
 *
 * WHAT GETS MEASURED matters more than the number, and the intuitive answer is
 * wrong here. A remote's `dist/` holds two overlapping graphs:
 *
 *   1. The federated graph — `remoteEntry.js` plus the transitive closure of the
 *      exposed module. This is what a reader downloads when the shell mounts the
 *      remote, and it is what the budget is set against.
 *   2. The standalone-harness graph — the closure of the remote's own
 *      `index.html`, including its copy of the Salt theme CSS. A development
 *      affordance, never served to a shell user, so it is reported and not gated.
 *
 * The tempting third bucket — "shared fallbacks, not fetched when federated" — is
 * a trap, and this script asserted it until a network trace disproved it. The
 * `@module-federation/vite` plugin gives the exposed module a *static* import of
 * each generated `loadShare` shim, and each shim statically imports its local
 * fallback implementation. So the browser fetches the remote's own copy of React,
 * the router, the query client and `@salt-ds/core` — a ~154 KB gz chunk — every
 * time the remote mounts, from every remote.
 *
 * Those bytes are wasted but the *semantics* are still correct: the shim resolves
 * the share against the host's already-initialised instance, so one React and one
 * Salt are ever instantiated. That was verified in a real browser rather than
 * assumed — the remotes' pages call `useState` and `useQuery` with no provider of
 * their own and no errors, which only works if those modules are the host's
 * instances, and no Salt style block is injected twice.
 *
 * Counting them is therefore the honest thing to do: they are real transfer on a
 * real navigation. It also means these numbers are large, and legitimately so.
 *
 * Graphs come from Vite's own `.vite/manifest.json` (which records each entry and
 * its imports) and `mf-manifest.json` (which names the remote entry and the
 * exposed module) rather than from filename guessing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Kilobytes, gzipped, of what is actually transferred.
 *
 * `apps/shell` is its whole output: the host is the share provider and ships
 * every shared module, `@salt-ds/core` alone being ~154 KB gz.
 *
 * The remote numbers are large for the reason in the header comment — the plugin
 * eagerly fetches each remote's shared fallbacks even though the host's instances
 * win. Roughly 330 KB gz of each remote's ~340 is that. The ceiling is set just
 * above today's measurement so a genuine regression in the remote's *own* code
 * still trips it, rather than being lost in a large constant.
 */
const BUDGETS = {
  'apps/shell': 440,
  'remotes/catalog': 360,
  'remotes/operations': 360,
};

const gzKb = (file) => gzipSync(readFileSync(file)).length / 1024;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * Transitive closure of a Vite manifest entry: the chunk, its CSS, and every
 * chunk it statically imports, recursively.
 *
 * The closure is the point. `mf-manifest.json` lists only the exposed module's
 * own chunk, which reads as ~11 KB and hides the ~330 KB of shared-fallback
 * chunks that chunk statically imports. Following the import graph is what makes
 * the number match a network trace.
 */
function closure(viteManifest, entryKey) {
  const out = new Set();
  const seen = new Set();

  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = viteManifest[key];
    if (!chunk) return;
    if (chunk.file) out.add(chunk.file);
    for (const css of chunk.css ?? []) out.add(css);
    // `dynamicImports` are deliberately excluded: route-level lazy loading is the
    // splitting lever we want people to reach for, so charging for it up front
    // would penalise the right behaviour.
    for (const dep of chunk.imports ?? []) visit(dep);
  };

  visit(entryKey);
  return out;
}

/** The manifest key of the entry matching a predicate, or undefined. */
function findEntry(viteManifest, predicate) {
  return Object.keys(viteManifest).find((k) => viteManifest[k]?.isEntry && predicate(k));
}

const sum = (files, dist) => [...files].reduce((acc, f) => acc + gzKb(join(dist, f)), 0);

let failed = false;
const manifests = {};

for (const [app, budgetKb] of Object.entries(BUDGETS)) {
  const dist = join(ROOT, app, 'dist');
  if (!existsSync(dist)) {
    console.error(`  MISSING  ${app}/dist — run npm run build:e2e first`);
    failed = true;
    continue;
  }

  // The manifest is the federation plugin's own output. Without it the build
  // produced files but not federated ones, which would make a passing size
  // check meaningless. It is also what the bucketing below reads.
  const manifestPath = join(dist, 'mf-manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`  MISSING  ${app}/dist/mf-manifest.json — the federation plugin did not emit`);
    failed = true;
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifests[app] = manifest;

  const present = walk(dist)
    .filter((f) => /\.(js|css)$/.test(f))
    .map((f) => relative(dist, f));

  // Vite's manifest carries the import graph; the federation manifest does not.
  const vitePath = join(dist, '.vite', 'manifest.json');
  if (!existsSync(vitePath)) {
    console.error(`  MISSING  ${app}/dist/.vite/manifest.json — set build.manifest`);
    failed = true;
    continue;
  }
  const viteManifest = JSON.parse(readFileSync(vitePath, 'utf8'));

  const isRemote = (manifest.exposes ?? []).length > 0;

  if (!isRemote) {
    // Host: the static closure of its own entry — what a reader downloads before
    // anything is interactive. Everything behind a dynamic import is reported
    // separately, which is the whole point of putting it there: the interceptor
    // for the mocked lane and the dev persona roster are both dynamic, and
    // charging the initial load for them would make the number lane-dependent
    // and stop it describing a production visit.
    const htmlKey = findEntry(viteManifest, (k) => k.endsWith('.html'));
    if (!htmlKey) {
      console.error(`  MISSING  ${app}: no html entry in the Vite manifest`);
      failed = true;
      continue;
    }
    const initial = closure(viteManifest, htmlKey);
    const initialKb = sum(initial, dist);
    const deferredKb = present
      .filter((f) => !initial.has(f))
      .reduce((acc, f) => acc + gzKb(join(dist, f)), 0);

    const over = initialKb > budgetKb;
    if (over) failed = true;
    console.log(
      `  ${over ? 'OVER' : 'ok  '} ${app.padEnd(22)} initial ${initialKb.toFixed(1).padStart(6)} KB gz ` +
        `(budget ${budgetKb}) · +${deferredKb.toFixed(0)} KB gz behind dynamic imports · ` +
        `provides ${(manifest.shared ?? []).length} shares`,
    );
    continue;
  }

  // What the shell fetches: the remote entry, plus everything the exposed module
  // pulls in — the fallback chunks among them.
  const exposeKey = findEntry(viteManifest, (k) => k.includes('expose/App'));
  if (!exposeKey) {
    console.error(`  MISSING  ${app}: no expose/App entry in the Vite manifest`);
    failed = true;
    continue;
  }
  const federated = closure(viteManifest, exposeKey);
  const entryName = manifest.metaData?.remoteEntry?.name;
  if (entryName && present.includes(entryName)) federated.add(entryName);

  // The standalone harness, counted only where it does not overlap the above.
  const htmlKey = findEntry(viteManifest, (k) => k.endsWith('.html'));
  const harnessOnly = htmlKey
    ? [...closure(viteManifest, htmlKey)].filter((f) => !federated.has(f))
    : [];

  const federatedKb = sum(federated, dist);
  const harnessKb = sum(harnessOnly, dist);

  const over = federatedKb > budgetKb;
  if (over) failed = true;
  console.log(
    `  ${over ? 'OVER' : 'ok  '} ${app.padEnd(22)} fetched ${federatedKb.toFixed(1).padStart(6)} KB gz ` +
      `(budget ${budgetKb}) · +${harnessKb.toFixed(0)} KB gz standalone harness, not served via the shell`,
  );
}

/**
 * The share contract, checked against what was actually built.
 *
 * `check-shared-parity.mjs` compares the declared versions across
 * `package.json` files; this compares what the plugin emitted. A share the host
 * does not provide falls back to the remote's own copy — the duplicate-React
 * failure the whole contract exists to prevent — and it is invisible in the
 * source.
 */
const host = manifests['apps/shell'];
if (host) {
  const hostShares = new Map((host.shared ?? []).map((s) => [s.name, s]));
  for (const [app, manifest] of Object.entries(manifests)) {
    if (manifest === host) continue;
    for (const share of manifest.shared ?? []) {
      const hostShare = hostShares.get(share.name);
      if (!hostShare) {
        console.error(`  SHARE  ${app} shares ${share.name}, host does not provide it`);
        failed = true;
      } else if (hostShare.version !== share.version) {
        console.error(
          `  SHARE  ${share.name}: host ${hostShare.version}, ${app} ${share.version} — ` +
            `two copies will load`,
        );
        failed = true;
      }
      if (share.singleton !== true) {
        console.error(`  SHARE  ${app} declares ${share.name} without singleton: true`);
        failed = true;
      }
    }
  }
}

if (failed) {
  console.error('\ncheck-bundle-budget: FAIL');
  console.error('Raise a budget deliberately, or move code behind a lazy route import.');
  process.exit(1);
}
console.log('\ncheck-bundle-budget: PASS');
