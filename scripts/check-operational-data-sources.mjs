#!/usr/bin/env node
/**
 * Assert that the console reads operational data only from first-party APIs.
 *
 * Two failure modes, banned for different reasons.
 *
 * ## Depending on an external dashboard
 *
 * Grafana is deployment infrastructure. It is optional, it is frequently absent,
 * and this product does not ship it — so a console that links into it as its
 * source of operational truth simply stops working wherever it was not deployed.
 * That is not a degraded experience; it is a blank page where the numbers were.
 *
 * Operational data reaches this console through an operator endpoint the service
 * itself serves. External dashboards may exist alongside it; nothing here may
 * require, name, or construct a URL into one.
 *
 * ## Parsing the Prometheus exposition in the browser
 *
 * This existed and shipped, and it was wrong in three independent ways — any
 * one of which is enough to keep it out:
 *
 *   1. The exposition is per-process and cumulative since that process started.
 *      Behind more than one replica a scrape lands on whichever pod the load
 *      balancer picked, so the page rendered one arbitrary replica while
 *      presenting it as the service. Nothing on screen said so, and nothing
 *      could: the reader has no way to tell a total from a sample of one.
 *   2. Rates and percentiles need a time series database. A single scrape
 *      cannot produce a rate — the page it powered conceded this by drawing a
 *      sparkline of the change since the tab happened to open, which measures
 *      the reader's browsing session rather than the service.
 *   3. `/metrics` now requires a bearer credential, because it publishes the
 *      route table, entitlement-failure counts, and per-tool call counts. A
 *      browser that could read it would need that credential handed to every
 *      console user.
 *
 * A lint rule would be the obvious mechanism and is the wrong one: this is not
 * about an import path. Someone can reasonably reintroduce the same mistake by
 * fetching `/metrics` directly and splitting on newlines, which no
 * `no-restricted-imports` entry would see. So the check is over source text,
 * and it looks for the *behaviour* — touching the endpoint, or parsing what it
 * returns.
 *
 * Test files are in scope deliberately. A test that parses an exposition, or
 * asserts a dashboard link, is testing a capability the product must not have.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** Product source. `scripts/` is excluded — this file has to name what it bans. */
const SEARCH_ROOTS = ['packages', 'remotes', 'apps'];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.vite',
  'coverage',
  'playwright-report',
]);

/**
 * `@knowledge-ui/testing` is exempt for one narrow reason: its mock service
 * worker must still answer `GET /metrics`, because the real endpoint exists and
 * a handler that omits it would let a request escape to the network in tests.
 * Serving a canned body is not parsing one.
 */
const EXEMPT = [join('packages', 'testing')];

/**
 * The generated OpenAPI client *describes* every path the API publishes,
 * `/metrics` among them. Describing a path is not calling it, and the file is
 * regenerated from the server's schema, so a violation here could not be fixed
 * by hand anyway.
 */
const EXEMPT_SEGMENTS = ['/generated/'];

const PATTERNS = [
  {
    // Reaching for the endpoint at all.
    re: /['"`][^'"`]*\/metrics['"`]/,
    why: 'fetches the metrics endpoint',
  },
  {
    // The parser and its helpers, by name, in case the module returns.
    re: /\b(parsePrometheusText|fetchMetricsText|useMetrics|MetricsSnapshot|sumByLabel|histogramQuantile|gaugeValue)\b/,
    why: 'uses the retired exposition parser',
  },
  {
    // Hand-rolled parsing: the shape someone reinvents without importing anything.
    re: /#\s*(HELP|TYPE)\s/,
    why: 'parses Prometheus exposition text by hand',
  },
  {
    // The tool by name, including a config key that merely mentions it.
    re: /grafana/i,
    why: 'depends on an external dashboard tool',
  },
  {
    // Its URL shape, in case someone links without naming the product.
    re: /\/d\/[\w-]+\?[^'"`]*viewPanel=/,
    why: 'constructs an external dashboard deep link',
  },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(p)) out.push(p);
  }
  return out;
}

const violations = [];

for (const root of SEARCH_ROOTS) {
  let files;
  try {
    files = walk(join(ROOT, root));
  } catch {
    continue; // a workspace that does not exist yet is not a violation
  }
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (EXEMPT.some((prefix) => rel.startsWith(prefix))) continue;
    if (EXEMPT_SEGMENTS.some((seg) => `/${rel}`.includes(seg))) continue;
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, index) => {
      // A line explaining the ban is not a violation of it. Comments are
      // skipped wholesale for the same reason: prose describing why the parser
      // was removed is exactly what a future reader needs, and a comment cannot
      // fetch anything. Commented-out code is inert by definition.
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
      if (line.includes('operational-data-source: intentional')) return;
      for (const { re, why } of PATTERNS) {
        if (re.test(line)) violations.push({ rel, line: index + 1, why, text: line.trim() });
      }
    });
  }
}

if (violations.length > 0) {
  console.error('check-operational-data-sources: FAIL\n');
  for (const v of violations) {
    console.error(`  ${v.why}\n    ${v.rel}:${v.line}  ${v.text.slice(0, 120)}`);
  }
  console.error('\nOperational data reaches this console through a first-party operator');
  console.error('endpoint. An external dashboard is optional infrastructure that may not be');
  console.error('deployed, and the Prometheus exposition is per-replica, cumulative since');
  console.error('process start, and credentialed. Neither is a source this console may use.');
  process.exit(1);
}

console.log('check-operational-data-sources: PASS');
