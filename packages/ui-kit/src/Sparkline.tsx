import { Text } from '@salt-ds/core';

import styles from './Sparkline.module.css';

/**
 * A minimal trend line for a bounded series.
 *
 * The metrics endpoint exposes cumulative counters and no history, so the only
 * series available is the one this tab has observed since it opened. That makes
 * a full charting library disproportionate — and it makes the gap handling below
 * load-bearing rather than defensive.
 */

/**
 * Build an SVG polyline path.
 *
 * `undefined` in the series is a deliberate signal, not missing data: it means a
 * counter decreased, which can only happen when the process restarted. Drawing
 * through that point would render a plunge and then a climb, implying a negative
 * rate that never occurred. So a gap breaks the line into separate segments.
 *
 * Exported for its own test — the edge cases (fewer than two points, an entirely
 * flat series, leading and trailing gaps) are where this kind of function
 * usually divides by zero.
 */
export function buildPath(
  values: ReadonlyArray<number | undefined>,
  width: number,
  height: number,
): string {
  const present = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (present.length < 2) return '';

  const min = Math.min(...present);
  const max = Math.max(...present);
  // A flat series has zero range. Placing it on the midline is the honest
  // rendering; dividing by the range would be NaN.
  const range = max - min;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  const y = (v: number) => (range === 0 ? height / 2 : height - ((v - min) / range) * height);

  let path = '';
  let penDown = false;
  values.forEach((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      penDown = false;
      return;
    }
    const x = index * stepX;
    path += `${penDown ? 'L' : 'M'}${x.toFixed(2)},${y(value).toFixed(2)} `;
    penDown = true;
  });

  return path.trim();
}

export function Sparkline({
  values,
  label,
  width = 120,
  height = 24,
}: {
  values: ReadonlyArray<number | undefined>;
  label: string;
  width?: number;
  height?: number;
}) {
  const path = buildPath(values, width, height);

  if (path === '') {
    // Two samples are the minimum for a trend. Saying so beats an empty box the
    // reader has to interpret.
    return (
      <Text color="secondary" styleAs="notation">
        collecting…
      </Text>
    );
  }

  const present = values.filter((v): v is number => typeof v === 'number');
  const latest = present[present.length - 1];
  const first = present[0];
  const direction =
    latest !== undefined && first !== undefined
      ? latest > first
        ? 'rising'
        : latest < first
          ? 'falling'
          : 'flat'
      : 'flat';

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}: ${direction}, ${present.length} samples, latest ${latest ?? 0}`}
    >
      <path className={styles.line} d={path} />
    </svg>
  );
}
