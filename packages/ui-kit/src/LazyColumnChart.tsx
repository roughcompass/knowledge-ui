import { Suspense, lazy } from 'react';

import type { Bar } from './ColumnChart';

/**
 * The chart, loaded on demand.
 *
 * ## Why the boundary exists
 *
 * `recharts` is ~112 KB gz — measured, with React external. The budgets it would
 * have to fit inside had 6 KB of headroom on the catalog remote and 12.5 KB on
 * operations, so importing it statically from the kit would have put every remote
 * ~100 KB over on a first paint that most readers spend on a page with no chart at
 * all. Module Federation makes that worse rather than better: each remote fetches
 * its own copy of every shared fallback, so a share would have duplicated the bytes
 * and only deduplicated the *instance*.
 *
 * A dynamic import puts it in its own chunk, outside the exposed module's graph.
 * The budget script measures that graph, so the charts cost nothing until a reader
 * opens a page that has one — and then the chunk is cached for every other chart.
 *
 * ## Why the fallback is empty rather than a spinner
 *
 * `Figure` already reserves the mark's height, and this renders inside that box. An
 * empty box for the width of a chunk fetch is calmer than a spinner that appears
 * and vanishes, and it cannot shift the layout. A chart that fails to load leaves
 * the figure's table, which carries every number anyway — the pairing is what makes
 * that acceptable.
 */
const Chart = lazy(async () => {
  const loaded = await import('./ColumnChart');
  return { default: loaded.ColumnChart };
});

export function LazyColumnChart({
  bars,
  valueLabel,
}: {
  bars: readonly Bar[];
  valueLabel: string;
}) {
  return (
    <Suspense fallback={null}>
      <Chart bars={bars} valueLabel={valueLabel} />
    </Suspense>
  );
}
