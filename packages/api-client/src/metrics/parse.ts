/**
 * A parser for the Prometheus text exposition format.
 *
 * The API exposes `/metrics` as text and nothing else — there is no JSON
 * variant and no query API — so a UI that wants to show any of it has to parse
 * the format itself.
 *
 * Scope is deliberately the subset this exposition actually uses: counters,
 * gauges and histograms, with `# HELP` / `# TYPE` metadata. Summaries and
 * exemplars are not emitted by the server and are not handled.
 *
 * The fiddly part is label values, which are quoted strings that may contain
 * escaped quotes, escaped backslashes and `\n`, and may contain commas. Naive
 * `split(',')` breaks on `{reason="a,b"}`, which is a real value the
 * entitlement metrics can produce.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary' | 'untyped';

export interface MetricSample {
  /** Series name as written, e.g. `foo_bucket` for a histogram bucket line. */
  name: string;
  labels: Record<string, string>;
  value: number;
}

export interface MetricFamily {
  /** Family name with `_bucket` / `_sum` / `_count` stripped for histograms. */
  name: string;
  type: MetricType;
  help: string | undefined;
  samples: MetricSample[];
}

export type MetricsSnapshot = Map<string, MetricFamily>;

/** Prometheus escapes `\`, `"` and newline inside a label value. */
function unescapeLabelValue(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[++i];
    if (next === 'n') out += '\n';
    else if (next === '\\') out += '\\';
    else if (next === '"') out += '"';
    else out += next ?? '';
  }
  return out;
}

/**
 * Split `a="1",b="x,y"` respecting quotes and escapes.
 *
 * Written as a character scanner rather than a regex because the escape rules
 * make a correct regex both unreadable and easy to get subtly wrong.
 */
function parseLabels(inner: string): Record<string, string> {
  const labels: Record<string, string> = {};
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && (inner[i] === ',' || inner[i] === ' ')) i++;
    if (i >= inner.length) break;

    const eq = inner.indexOf('=', i);
    if (eq === -1) break;
    const key = inner.slice(i, eq).trim();

    let j = eq + 1;
    if (inner[j] !== '"') break; // malformed; stop rather than guess
    j++;
    let value = '';
    while (j < inner.length) {
      const ch = inner[j];
      if (ch === '\\') {
        value += ch;
        value += inner[j + 1] ?? '';
        j += 2;
        continue;
      }
      if (ch === '"') break;
      value += ch;
      j++;
    }
    labels[key] = unescapeLabelValue(value);
    i = j + 1;
  }
  return labels;
}

/** `+Inf`, `-Inf` and `NaN` are all legal values in this format. */
function parseValue(raw: string): number {
  const t = raw.trim();
  if (t === '+Inf') return Number.POSITIVE_INFINITY;
  if (t === '-Inf') return Number.NEGATIVE_INFINITY;
  if (t === 'NaN') return Number.NaN;
  return Number.parseFloat(t);
}

/** Histogram sample lines belong to the family without their suffix. */
function familyNameFor(seriesName: string, types: Map<string, MetricType>): string {
  for (const suffix of ['_bucket', '_sum', '_count'] as const) {
    if (seriesName.endsWith(suffix)) {
      const base = seriesName.slice(0, -suffix.length);
      const t = types.get(base);
      if (t === 'histogram' || t === 'summary') return base;
    }
  }
  return seriesName;
}

export function parsePrometheusText(text: string): MetricsSnapshot {
  const families: MetricsSnapshot = new Map();
  const helps = new Map<string, string>();
  const types = new Map<string, MetricType>();

  // Metadata first: a `# TYPE` line may follow its samples in principle, and
  // we need the type to know whether `foo_bucket` is its own family or part of
  // `foo`.
  for (const line of text.split('\n')) {
    if (line.charCodeAt(0) !== 35 /* # */) continue;
    const help = /^#\s+HELP\s+(\S+)\s+(.*)$/.exec(line);
    if (help?.[1]) {
      helps.set(help[1], help[2] ?? '');
      continue;
    }
    const type = /^#\s+TYPE\s+(\S+)\s+(\S+)/.exec(line);
    if (type?.[1] && type[2]) types.set(type[1], type[2] as MetricType);
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.charCodeAt(0) === 35) continue;

    const brace = line.indexOf('{');
    let seriesName: string;
    let labels: Record<string, string>;
    let rest: string;

    if (brace === -1) {
      const sp = line.indexOf(' ');
      if (sp === -1) continue;
      seriesName = line.slice(0, sp);
      labels = {};
      rest = line.slice(sp + 1);
    } else {
      seriesName = line.slice(0, brace);
      const close = line.lastIndexOf('}');
      if (close === -1) continue;
      labels = parseLabels(line.slice(brace + 1, close));
      rest = line.slice(close + 1);
    }

    const value = parseValue(rest);
    if (Number.isNaN(value) && rest.trim() !== 'NaN') continue;

    const family = familyNameFor(seriesName, types);
    let entry = families.get(family);
    if (!entry) {
      entry = {
        name: family,
        type: types.get(family) ?? 'untyped',
        help: helps.get(family),
        samples: [],
      };
      families.set(family, entry);
    }
    entry.samples.push({ name: seriesName, labels, value });
  }

  return families;
}

/** Sum a counter family across all label combinations. */
export function sumFamily(snapshot: MetricsSnapshot, name: string): number {
  const family = snapshot.get(name);
  if (!family) return 0;
  return family.samples.reduce((acc, s) => acc + (Number.isFinite(s.value) ? s.value : 0), 0);
}

/** Group a family's samples by one label, summing each group. */
export function sumByLabel(
  snapshot: MetricsSnapshot,
  name: string,
  label: string,
): Array<{ label: string; value: number }> {
  const family = snapshot.get(name);
  if (!family) return [];
  const totals = new Map<string, number>();
  for (const s of family.samples) {
    const key = s.labels[label] ?? '(none)';
    totals.set(key, (totals.get(key) ?? 0) + (Number.isFinite(s.value) ? s.value : 0));
  }
  return [...totals.entries()]
    .map(([l, value]) => ({ label: l, value }))
    .sort((a, b) => b.value - a.value);
}

/** A single gauge reading, or undefined when the family is absent. */
export function gaugeValue(snapshot: MetricsSnapshot, name: string): number | undefined {
  const family = snapshot.get(name);
  const first = family?.samples[0];
  return first ? first.value : undefined;
}

/**
 * Interpolate a quantile from cumulative histogram buckets.
 *
 * This is an estimate and the UI must say so. Buckets are cumulative counts at
 * `le` boundaries, so the true value is only known to lie within a bucket; we
 * interpolate linearly inside it, which is what Prometheus itself does.
 *
 * Returns undefined when the family is missing or empty. Returns the largest
 * finite boundary when everything landed in the `+Inf` bucket — the honest
 * answer there is "at least this", and reporting Infinity would render as
 * nonsense.
 */
export function histogramQuantile(
  snapshot: MetricsSnapshot,
  name: string,
  quantile: number,
): number | undefined {
  const family = snapshot.get(name);
  if (!family) return undefined;

  const buckets = family.samples
    .filter((s) => s.name.endsWith('_bucket') && s.labels.le !== undefined)
    .map((s) => ({ le: parseValue(s.labels.le as string), count: s.value }))
    .sort((a, b) => a.le - b.le);

  if (buckets.length === 0) return undefined;

  const total = buckets[buckets.length - 1]?.count ?? 0;
  if (total <= 0) return undefined;

  const target = quantile * total;
  let prevLe = 0;
  let prevCount = 0;

  for (const bucket of buckets) {
    if (bucket.count >= target) {
      if (!Number.isFinite(bucket.le)) {
        const lastFinite = [...buckets].reverse().find((b) => Number.isFinite(b.le));
        return lastFinite?.le;
      }
      const span = bucket.count - prevCount;
      if (span <= 0) return bucket.le;
      return prevLe + ((target - prevCount) / span) * (bucket.le - prevLe);
    }
    prevLe = Number.isFinite(bucket.le) ? bucket.le : prevLe;
    prevCount = bucket.count;
  }
  return undefined;
}
