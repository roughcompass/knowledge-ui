#!/usr/bin/env node
/**
 * Compares the vendored API document against the running service.
 *
 * The existing codegen lane proves the generated types match the *vendored* document.
 * It says nothing about whether that document matches the service, which is how the
 * copy in this repo fell forty-two paths behind without a single check going red —
 * the client could not be generated against endpoints it could not see, so whole
 * domains were unreachable and nothing reported it.
 *
 * Compares the set of method-and-path pairs only. A whole-document comparison would
 * fail on every schema description and example the service happens to word
 * differently, which is noise that gets a guard switched off.
 *
 * **Skips when no service is reachable, and says so.** Continuous integration
 * provisions no backend here, so a hard failure would make this unrunnable where it
 * runs most often; a developer with the stack up gets the signal, which is where
 * acting on it is cheap. That is the same trade the live end-to-end lane already
 * makes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTTP_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'patch',
  'head',
  'options',
  'trace',
]);

const target = process.env.KUI_API_TARGET ?? 'http://localhost:8000';

function operations(spec) {
  return new Set(
    Object.entries(spec.paths ?? {}).flatMap(([path, ops]) =>
      Object.keys(ops)
        .filter((method) => HTTP_METHODS.has(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    ),
  );
}

const vendored = operations(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../packages/api-client/openapi/registry.openapi.json', import.meta.url)),
      'utf8',
    ),
  ),
);

let live;
try {
  const response = await fetch(`${target}/openapi.json`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  live = operations(await response.json());
} catch (error) {
  console.log(
    `check-spec-freshness: SKIP (no service at ${target} — ${error instanceof Error ? error.message : String(error)})`,
  );
  console.log('  Start the registry and re-run to compare the vendored document against it.');
  process.exit(0);
}

const missing = [...live].filter((operation) => !vendored.has(operation)).sort();
const removed = [...vendored].filter((operation) => !live.has(operation)).sort();

if (missing.length === 0 && removed.length === 0) {
  console.log(`check-spec-freshness: PASS (${vendored.size} operations match ${target})`);
  process.exit(0);
}

console.error('check-spec-freshness: FAIL');
if (missing.length > 0) {
  console.error(`\n  Served but not vendored (${missing.length}) — the client cannot reach these:`);
  for (const operation of missing) console.error(`    + ${operation}`);
}
if (removed.length > 0) {
  console.error(`\n  Vendored but not served (${removed.length}) — a call here would 404:`);
  for (const operation of removed) console.error(`    - ${operation}`);
}
console.error('\n  Re-vendor with: make openapi-export in the registry, copy to');
console.error('  packages/api-client/openapi/registry.openapi.json, then npm run codegen.');
process.exit(1);
