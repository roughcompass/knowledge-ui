import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  gaugeValue,
  histogramQuantile,
  parsePrometheusText,
  sumByLabel,
  sumFamily,
} from '../parse';

/**
 * The fixture is a verbatim capture from a running registry, not a
 * hand-written approximation. A parser tested only against invented input
 * tends to encode the author's mental model of the format rather than the
 * format, and this exposition has at least two features that are easy to get
 * wrong from memory: histogram families are split across three suffixed series,
 * and `+Inf` is a legal bucket boundary.
 */
const REAL = readFileSync(join(__dirname, 'metrics.fixture.txt'), 'utf8');

describe('parsePrometheusText against a real capture', () => {
  const snapshot = parsePrometheusText(REAL);

  it('parses every family without throwing', () => {
    expect(snapshot.size).toBeGreaterThan(5);
  });

  it('reads a gauge the operations page depends on', () => {
    expect(gaugeValue(snapshot, 'catalog_outbox_pending_size')).toBe(0);
  });

  it('collapses a histogram into one family rather than three', () => {
    const family = snapshot.get('registry_entitlement_call_duration_seconds');
    expect(family).toBeDefined();
    expect(family?.type).toBe('histogram');
    // _bucket, _sum and _count all belong to the same family.
    expect(family?.samples.some((s) => s.name.endsWith('_bucket'))).toBe(true);
    expect(family?.samples.some((s) => s.name.endsWith('_count'))).toBe(true);
    // ...and none of them leaked out as a family of their own.
    expect(snapshot.has('registry_entitlement_call_duration_seconds_bucket')).toBe(false);
  });

  it('keeps HELP text so the UI can label a metric it does not hardcode', () => {
    expect(snapshot.get('catalog_outbox_pending_size')?.help).toBeTruthy();
  });

  it('separates the runtime collectors from the application families', () => {
    const app = [...snapshot.keys()].filter(
      (k) => k.startsWith('registry_') || k.startsWith('catalog_'),
    );
    const runtime = [...snapshot.keys()].filter(
      (k) => k.startsWith('python_') || k.startsWith('process_'),
    );
    expect(app.length).toBeGreaterThan(0);
    expect(runtime.length).toBeGreaterThan(0);
  });
});

describe('label parsing', () => {
  it('handles a comma inside a quoted label value', () => {
    // A naive split(',') produces two broken labels here. The entitlement
    // metrics carry free-text reasons, so this is reachable input.
    const s = parsePrometheusText('foo{reason="a,b",other="c"} 3');
    const sample = s.get('foo')?.samples[0];
    expect(sample?.labels).toEqual({ reason: 'a,b', other: 'c' });
    expect(sample?.value).toBe(3);
  });

  it('handles escaped quotes and backslashes', () => {
    const s = parsePrometheusText('foo{msg="say \\"hi\\"",path="a\\\\b"} 1');
    expect(s.get('foo')?.samples[0]?.labels).toEqual({ msg: 'say "hi"', path: 'a\\b' });
  });

  it('handles an escaped newline', () => {
    const s = parsePrometheusText('foo{msg="a\\nb"} 1');
    expect(s.get('foo')?.samples[0]?.labels.msg).toBe('a\nb');
  });

  it('handles a metric with no labels', () => {
    const s = parsePrometheusText('# TYPE foo gauge\nfoo 42');
    expect(s.get('foo')?.samples[0]).toMatchObject({ labels: {}, value: 42 });
  });

  it('ignores comments and blank lines', () => {
    const s = parsePrometheusText('\n# HELP foo bar\n\n# TYPE foo counter\nfoo 1\n\n');
    expect(s.get('foo')?.samples).toHaveLength(1);
  });
});

describe('special values', () => {
  it('parses +Inf, -Inf and NaN', () => {
    const s = parsePrometheusText('a 1\nb +Inf\nc -Inf\nd NaN');
    expect(s.get('b')?.samples[0]?.value).toBe(Number.POSITIVE_INFINITY);
    expect(s.get('c')?.samples[0]?.value).toBe(Number.NEGATIVE_INFINITY);
    expect(s.get('d')?.samples[0]?.value).toBeNaN();
  });

  it('parses scientific notation', () => {
    const s = parsePrometheusText('a 1.7976931348623157e+308');
    expect(s.get('a')?.samples[0]?.value).toBeGreaterThan(1e300);
  });
});

describe('aggregation helpers', () => {
  const text = [
    '# TYPE calls counter',
    'calls{status_class="2xx"} 10',
    'calls{status_class="5xx"} 4',
    'calls{status_class="2xx"} 1',
  ].join('\n');

  it('sums a whole family', () => {
    expect(sumFamily(parsePrometheusText(text), 'calls')).toBe(15);
  });

  it('groups by a label, descending', () => {
    expect(sumByLabel(parsePrometheusText(text), 'calls', 'status_class')).toEqual([
      { label: '2xx', value: 11 },
      { label: '5xx', value: 4 },
    ]);
  });

  it('returns empty rather than throwing for an absent family', () => {
    expect(sumByLabel(parsePrometheusText(text), 'nope', 'x')).toEqual([]);
    expect(sumFamily(parsePrometheusText(text), 'nope')).toBe(0);
    expect(gaugeValue(parsePrometheusText(text), 'nope')).toBeUndefined();
  });
});

describe('histogramQuantile', () => {
  const hist = [
    '# TYPE h histogram',
    'h_bucket{le="1"} 0',
    'h_bucket{le="2"} 50',
    'h_bucket{le="4"} 100',
    'h_bucket{le="+Inf"} 100',
    'h_sum 250',
    'h_count 100',
  ].join('\n');

  it('interpolates inside the bucket containing the quantile', () => {
    // p50 of 100 observations is the 50th; it lands exactly at the le=2 edge.
    expect(histogramQuantile(parsePrometheusText(hist), 'h', 0.5)).toBeCloseTo(2, 5);
  });

  it('interpolates linearly between boundaries', () => {
    // p75 → 75th observation, three quarters through the 2..4 bucket.
    expect(histogramQuantile(parsePrometheusText(hist), 'h', 0.75)).toBeCloseTo(3, 5);
  });

  it('returns the largest finite boundary when everything is in +Inf', () => {
    // Reporting Infinity would render as nonsense; "at least 4" is the honest
    // answer and the only one a reader can act on.
    const all = [
      '# TYPE h histogram',
      'h_bucket{le="4"} 0',
      'h_bucket{le="+Inf"} 10',
      'h_count 10',
    ].join('\n');
    expect(histogramQuantile(parsePrometheusText(all), 'h', 0.9)).toBe(4);
  });

  it('returns undefined for an empty histogram rather than 0', () => {
    // A p95 of 0 reads as "very fast". Undefined lets the UI say "no data".
    const empty = [
      '# TYPE h histogram',
      'h_bucket{le="1"} 0',
      'h_bucket{le="+Inf"} 0',
      'h_count 0',
    ].join('\n');
    expect(histogramQuantile(parsePrometheusText(empty), 'h', 0.95)).toBeUndefined();
  });

  it('returns undefined for an absent family', () => {
    expect(histogramQuantile(parsePrometheusText(hist), 'nope', 0.5)).toBeUndefined();
  });

  it('handles the real capture, where the histogram is all zeros', () => {
    // The dev stack has served no entitlement calls, so every bucket is 0.
    // This must not produce 0 or Infinity.
    const s = parsePrometheusText(REAL);
    expect(
      histogramQuantile(s, 'registry_entitlement_call_duration_seconds', 0.95),
    ).toBeUndefined();
  });
});

describe('malformed input', () => {
  it('skips a line with an unterminated label block', () => {
    const s = parsePrometheusText('good 1\nbad{unterminated 2\ngood2 3');
    expect(s.has('good')).toBe(true);
    expect(s.has('good2')).toBe(true);
  });

  it('returns an empty snapshot for empty input', () => {
    expect(parsePrometheusText('').size).toBe(0);
  });
});
