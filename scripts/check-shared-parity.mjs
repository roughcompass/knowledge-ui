#!/usr/bin/env node
/**
 * Every workspace must pin the same exact version for anything Module
 * Federation shares.
 *
 * Why this needs a script: a version drift here does not fail the build and
 * does not throw at runtime in any obvious place. MF logs a warning to the
 * console and loads a second copy of the module. The symptom arrives later and
 * somewhere else — a hook error in a component that is fine, a Salt component
 * rendering unthemed, `useParams()` returning an empty object. By then nobody
 * connects it to a caret in a package.json.
 *
 * Exits non-zero listing every mismatch.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Parse PINNED out of mf.shared.ts without needing a TypeScript loader. */
function readPinned() {
  const src = readFileSync(join(ROOT, 'mf.shared.ts'), 'utf8');
  const block = src.match(/export const PINNED = \{([\s\S]*?)\} as const;/);
  if (!block) throw new Error('could not locate the PINNED block in mf.shared.ts');
  const pinned = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*'?([@\w./-]+)'?\s*:\s*'([^']+)'/);
    if (m) pinned[m[1]] = m[2];
  }
  if (Object.keys(pinned).length === 0) throw new Error('PINNED parsed as empty');
  return pinned;
}

function workspacePackageJsons() {
  const out = [];
  for (const group of ['packages', 'apps', 'remotes']) {
    const dir = join(ROOT, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name, 'package.json');
      if (existsSync(p))
        out.push({
          rel: `${group}/${name}/package.json`,
          json: JSON.parse(readFileSync(p, 'utf8')),
        });
    }
  }
  return out;
}

const pinned = readPinned();
const failures = [];

for (const { rel, json } of workspacePackageJsons()) {
  const deps = { ...json.dependencies, ...json.peerDependencies };
  for (const [name, want] of Object.entries(pinned)) {
    const got = deps[name];
    if (got === undefined) continue; // not every workspace uses every share
    if (got !== want) {
      failures.push(`${rel}: ${name} is "${got}", must be exactly "${want}" (see mf.shared.ts)`);
    }
  }
  for (const [name, range] of Object.entries(json.dependencies ?? {})) {
    if (name in pinned && /^[\^~>=<]/.test(range)) {
      failures.push(`${rel}: ${name} uses a range ("${range}"); federated shares must be exact`);
    }
  }
}

if (failures.length > 0) {
  console.error('check-shared-parity: FAIL\n');
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    '\nA drift here does not fail loudly at runtime — it loads a second copy of the module.',
  );
  process.exit(1);
}
console.log(`check-shared-parity: PASS (${Object.keys(pinned).length} shared modules verified)`);
