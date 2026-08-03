#!/usr/bin/env node
/**
 * Shipped code must not reference internal planning documents.
 *
 * The planning artifacts live in a different repository. A future reader of
 * this repo alone cannot resolve "ADR-006" or "F1.11" or "Phase 6" — those
 * point at context that has gone missing, and the comment ends up implying
 * there is a reason somewhere without carrying it. Comments should state the
 * rule in the code's own vocabulary instead.
 *
 * Task IDs are exempt in commit subjects, which is where they belong: git
 * history ships with the repo, so `git log --grep=KUI-P1-T03` stays resolvable.
 *
 * A line ending in `doc-ref: intentional` is skipped, for the rare case where
 * citing a stable public URL or an RFC is genuinely the right thing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PATTERNS = [
  { re: /\bADR-\d+\b/, hint: 'architecture-decision label' },
  { re: /\bF\d+\.\d+\b/, hint: 'PRD feature number' },
  { re: /\bOQ-[A-Za-z0-9-]+/, hint: 'open-question label' },
  { re: /\bAQ-?F?\d+\b/, hint: 'architecture-question label' },
  { re: /\bKUI-P\d+-T\d+[a-z]?\b/, hint: 'task ID (belongs in the commit subject, not the code)' },
  { re: /\bDCU-P\d+-T\d+[a-z]?\b/, hint: 'task ID from the sibling app' },
  { re: /PRD\s+§/, hint: 'document citation' },
  { re: /TDD\s+§/, hint: 'document citation' },
  {
    re: /\bPhase \d+\b/,
    hint: 'delivery-phase label — say what the code does, not when it was written',
  },
];

const SCANNED = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.js',
  '.jsx',
  '.css',
  '.md',
  '.json',
  '.yml',
  '.yaml',
]);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'generated',
  'test-results',
  'playwright-report',
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (SCANNED.has(extname(p))) yield p;
  }
}

const hits = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  // This script necessarily contains the patterns it looks for.
  if (rel === 'scripts/check-no-doc-refs.mjs') continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('doc-ref: intentional')) return;
    for (const { re, hint } of PATTERNS) {
      if (re.test(line)) {
        hits.push(`${rel}:${i + 1}  ${hint}\n      ${line.trim().slice(0, 110)}`);
        break;
      }
    }
  });
}

if (hits.length > 0) {
  console.error('check-no-doc-refs: FAIL\n');
  for (const h of hits) console.error(`  ${h}`);
  console.error(
    "\nExplain the rule in the code's own words. End a line with `doc-ref: intentional` to allow one.",
  );
  process.exit(1);
}
console.log('check-no-doc-refs: PASS');
