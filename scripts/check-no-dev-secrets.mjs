#!/usr/bin/env node
/**
 * A production build must not contain the development persona roster.
 *
 * The roster carries client credentials. It is kept in its own module so the
 * environment guard around its dynamic import gives the bundler a boundary it can
 * drop, and the secret itself is read from the environment rather than written as
 * a literal — because tree-shaking removes a module's *code* while a sourcemap
 * keeps its original text in `sourcesContent`, so a literal would still ship
 * inside `dist/**.map`.
 *
 * Both of those are mechanisms, and a mechanism that is not checked is a hope. A
 * bundler upgrade that stops honouring the boundary would ship credentials with no
 * other symptom, which is the specific failure this exists to prevent.
 *
 * ## Why this is a script and not four lines of `grep` in the workflow
 *
 * It replaced exactly that, and the shell version had a false negative that
 * mattered: `grep -rl … 2>/dev/null` over a directory that does not exist prints
 * nothing and exits non-zero, which the `if` read as "clean". So the check passed
 * whenever the build had not run — the one circumstance in which it proves
 * nothing. This asserts the artefacts are present before it believes their
 * silence.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PERSONAS } from './personas.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every artefact directory a reader could fetch.
 *
 * The shell is named separately rather than reached by index, because the
 * mocked-build check below reads it and an index would make that a lookup that
 * can return nothing.
 */
const SHELL_DIST = join(ROOT, 'apps/shell/dist');
const DIST_DIRS = [
  SHELL_DIST,
  join(ROOT, 'remotes/catalog/dist'),
  join(ROOT, 'remotes/operations/dist'),
];

/**
 * The development secret, read from the same file that supplies it to `vite dev`.
 *
 * Read rather than hardcoded so that changing the value in one place cannot leave
 * this check looking for a string nothing uses any more — a guard that passes
 * because its needle went stale is worse than no guard.
 */
function devSecretFromEnvFile() {
  const envPath = join(ROOT, '.env.development');
  if (!existsSync(envPath)) return null;
  const match = /^VITE_PERSONA_SECRET=(.*)$/m.exec(readFileSync(envPath, 'utf8'));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

const needles = [];
const secret = devSecretFromEnvFile();
if (secret) {
  needles.push({ text: secret, what: 'the development client secret' });
} else {
  /*
   * A missing needle is a failure, not a smaller search.
   *
   * The persona-roster branch below already fails loudly on this reasoning, and
   * this one used to just omit the needle — so renaming the key in the env file
   * silently dropped the secret from the search and the script still reported PASS
   * with a quietly reduced count.
   */
  console.error(
    'check-no-dev-secrets: FAIL\n\n  No VITE_PERSONA_SECRET line in .env.development, so the credential this\n  check exists to look for was never assembled. A guard that passes because\n  its needle went stale is worse than no guard.',
  );
  process.exit(1);
}
for (const persona of PERSONAS) {
  needles.push({ text: persona.clientId, what: `the ${persona.key} persona's client id` });
}

if (needles.length === 0) {
  console.error(
    'check-no-dev-secrets: FAIL\n\n  Nothing to search for. The persona roster resolved empty, so this run\n  would have passed without checking anything.',
  );
  process.exit(1);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/*
 * Empty counts as missing.
 *
 * `existsSync` is true for an empty directory, so one sailed past this check and
 * then produced zero hits over zero files — reported as PASS, indistinguishable
 * from a real credential-free build. That state is reachable: the bundler clears
 * the output directory at the *start* of a build, so a build that fails right
 * after leaves exactly this. It is the same false negative this script was written
 * to remove, one layer in.
 */
const missing = DIST_DIRS.filter((d) => !existsSync(d) || readdirSync(d).length === 0);
if (missing.length > 0) {
  console.error('check-no-dev-secrets: FAIL\n');
  for (const d of missing) console.error(`  no build output at ${relative(ROOT, d)}`);
  console.error(
    '\nThere is nothing to check. Run `npm run build` first — a missing directory\nis silence, not evidence.',
  );
  process.exit(1);
}

/*
 * The mocked end-to-end build bakes the roster in on purpose, so finding the
 * credentials there is correct and says nothing about what production ships.
 * Naming that case beats reporting a leak the reader then has to disprove.
 */
const shellFiles = [...walk(SHELL_DIST)].map((p) => relative(SHELL_DIST, p));
if (shellFiles.some((f) => /assets\/browser-[^/]+\.js$/.test(f))) {
  console.error(
    'check-no-dev-secrets: FAIL\n\n  This looks like the mocked end-to-end build: it bundles the request\n  interceptor, and it bakes the persona roster in deliberately. Checking it\n  proves nothing about a production artefact.\n\n  Run `npm run build` and check that instead.',
  );
  process.exit(1);
}

const hits = [];
for (const dir of DIST_DIRS) {
  for (const file of walk(dir)) {
    const contents = readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (contents.includes(needle.text)) {
        hits.push(`${relative(ROOT, file)}  contains ${needle.what}`);
      }
    }
  }
}

if (hits.length > 0) {
  console.error('check-no-dev-secrets: FAIL\n');
  for (const hit of hits) console.error(`  ${hit}`);
  console.error(
    "\nThe persona roster reached a production artefact. Its dynamic import is\nsupposed to be dropped by the environment guard in the persona module — check\nthat the guard still folds to a constant, and that no new import reaches the\nroster outside it. Sourcemaps count: they carry every module's original text.",
  );
  process.exit(1);
}

console.log(
  `check-no-dev-secrets: PASS (${needles.length} credentials absent from 3 build outputs)`,
);
