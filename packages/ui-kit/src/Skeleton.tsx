import { LinearProgress } from '@salt-ds/core';

/**
 * A placeholder bar, internal to this package on purpose.
 *
 * This kit refused skeletons for a long time, and the reason was good: a skeleton has
 * to mirror the shape of the content to be worth anything, and a mirror that drifts
 * is worse than an honest spinner. What made that argument decisive was the assumed
 * shape of the answer — a `<Skeleton>` exported to pages, each composing a wireframe
 * by hand, each free to fall out of step with the content beside it.
 *
 * So this is not exported from the package index, and no page can reach it. The
 * components that render skeletons generate them from the *same declaration* that
 * builds their real content — `DataTable` from its `columns` array, `StatTile` and
 * `DescriptionList` from their own slots. There is no second description of the
 * shape, so there is nothing to drift.
 *
 * The width varies by position rather than being uniform, because a grid of
 * identical bars reads as a loading graphic while a ragged one reads as text that
 * has not arrived. Derived from the index so it is stable across renders — a random
 * width would reflow on every paint.
 */
export function SkeletonBar({ index: _index = 0 }: { index?: number }) {
  return (
    <LinearProgress
      hideLabel
      // The row announces itself through `aria-busy` on the region; the bars are
      // decoration and would otherwise be read out as a run of empty elements.
      aria-hidden="true"
    />
  );
}
