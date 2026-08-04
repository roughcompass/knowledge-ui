import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The usage fixtures, checked against the schema they stand for.
 *
 * This exists because a fixture invented a `webhook` surface. The endpoint declares
 * two — `rest` and `mcp` — and the vendored schema closes the enum to those, so the
 * third was a value the API could never emit. It was there to hold a test case the
 * two real surfaces were both already spoken for, which is the honest version of how
 * that mistake happens.
 *
 * Nothing caught it, and the reason is worth writing down: a request handler passes a
 * plain object literal to `HttpResponse.json`, so no generic ties the literal to the
 * response schema. TypeScript infers a type *from* the fixture and then checks the
 * fixture against it, which is a tautology. The typecheck was clean the whole time.
 *
 * So the check has to be a value-level one against the document, which is what this
 * is. It reads the vendored spec rather than the generated types, because the
 * generated module is types only — erased at build time, with nothing to enumerate at
 * runtime.
 */

const spec = JSON.parse(
  readFileSync(
    new URL('../../../api-client/openapi/registry.openapi.json', import.meta.url),
    'utf8',
  ),
) as {
  components: {
    schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }>;
  };
};

/** Every closed vocabulary a usage fixture could get wrong. */
const CLOSED_VOCABULARIES: Array<{ schema: string; field: string }> = [
  { schema: 'SurfaceSummaryOut', field: 'surface' },
  { schema: 'DailyPointOut', field: 'surface' },
];

function enumFor(schema: string, field: string): string[] | undefined {
  return spec.components.schemas[schema]?.properties?.[field]?.enum;
}

describe('closed vocabularies in the usage responses', () => {
  it.each(CLOSED_VOCABULARIES)(
    'still closes $schema.$field, so a fixture cannot invent a value',
    ({ schema, field }) => {
      /*
       * If the API ever opens one of these to a free string, this test is the signal
       * to go and widen the fixtures deliberately — rather than discovering later
       * that a screen was only ever exercised against values that no longer bound it.
       */
      const values = enumFor(schema, field);
      expect(values, `${schema}.${field} is no longer a closed enum`).toBeDefined();
      expect(values).toEqual(['rest', 'mcp']);
    },
  );

  it('does not contain the surface a fixture once invented', () => {
    // Named explicitly so the regression has a test rather than only a comment.
    expect(enumFor('SurfaceSummaryOut', 'surface')).not.toContain('webhook');
  });
});

describe('the fixtures use only surfaces the API can emit', () => {
  /*
   * Read as text rather than by importing the handlers, deliberately. Importing
   * `msw/usage` pulls in `msw`, and this project runs in a Node environment where
   * that reaches for `async_hooks` — the same reason the package's own barrel does
   * not re-export the request entries. A regex over the fixture source is cruder and
   * has no such cost, and the thing being checked is a literal in that source.
   */
  const source = readFileSync(new URL('../msw/usage.ts', import.meta.url), 'utf8');

  it('names no surface outside the schema enum', () => {
    const allowed = new Set(enumFor('SurfaceSummaryOut', 'surface'));
    const named = [...source.matchAll(/surface:\s*'([a-z_]+)'/g)].map((m) => m[1] as string);

    expect(
      named.length,
      'no surface literals found — has the fixture shape changed?',
    ).toBeGreaterThan(0);
    for (const value of named) {
      expect(allowed, `the fixture names the surface "${value}"`).toContain(value);
    }
  });
});
