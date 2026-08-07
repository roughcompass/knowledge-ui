#!/usr/bin/env node
/**
 * Writes the path manifest beside the vendored API document.
 *
 * The document is forty thousand lines of JSON, so a regeneration produces a diff no
 * reviewer reads — which is how it drifted forty-two paths behind the running service
 * without anyone noticing. The manifest is the same information at a size a person
 * can check: one line per method and path, sorted, so adding an endpoint is one added
 * line and removing one is one removed line.
 *
 * Run by `npm run codegen`, and the result is committed. `ci:codegen` then fails if
 * the committed manifest disagrees with the committed document, which is what makes
 * a regeneration visible in review rather than buried.
 *
 * This says nothing about whether the vendored document matches the live service —
 * that is `check-spec-freshness.mjs`, which needs a running backend and so cannot be
 * the guard that always runs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

const specPath = fileURLToPath(
  new URL('../packages/api-client/openapi/registry.openapi.json', import.meta.url),
);
const manifestPath = fileURLToPath(
  new URL('../packages/api-client/openapi/paths.json', import.meta.url),
);

const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const entries = Object.entries(spec.paths ?? {})
  .flatMap(([path, operations]) =>
    Object.keys(operations)
      .filter((method) => HTTP_METHODS.has(method))
      .map((method) => `${method.toUpperCase()} ${path}`),
  )
  .sort();

writeFileSync(manifestPath, `${JSON.stringify(entries, null, 2)}\n`);
console.log(
  `write-spec-manifest: ${entries.length} operations across ${Object.keys(spec.paths ?? {}).length} paths`,
);
