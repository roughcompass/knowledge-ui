export { ContentColumn, Prose } from './Layout';

// App chrome. These live here rather than in the shell because ui-kit is the only
// workspace permitted a stylesheet, and the tab underline and card bands both
// need one.
export { AppShell } from './AppShell';
export { AppSidebar, SidebarBack } from './AppSidebar';
export { ScopeSwitcher, RailBrand, type ScopeOption } from './ScopeSwitcher';
export { ScopeBreadcrumb, type BreadcrumbSegment } from './ScopeBreadcrumb';
export { SectionCard } from './SectionCard';
export { StatTile } from './StatTile';
export { NavCard } from './NavCard';

export { PageHeader } from './PageHeader';
export { FilterBar, FilterField, popoverOverlayProps } from './FilterBar';

// The write path. Added with the first mutation in the app; see each file for why
// it exists rather than being a Salt component used directly.
export { FormRow } from './FormRow';
export { ActionResult } from './ActionResult';
export { ConfirmDialog } from './ConfirmDialog';
export { EmptyState } from './EmptyState';
export { UnavailableNotice } from './UnavailableNotice';

/**
 * Inline contextual feedback. The third of three ways to tell a reader something,
 * and its own docstring explains when to reach for it rather than for the two above:
 * a note qualifies data on the panel, an unavailable notice says the data cannot be
 * fetched, an empty state says the query found nothing and will fill later.
 */
export { Note } from './Note';
export { LoadingPanel } from './LoadingPanel';
export { ErrorPanel } from './ErrorPanel';
export { DataTable, type Column, type DataTableProps } from './DataTable';
export { CursorPager } from './CursorPager';
export { CopyButton } from './CopyButton';
export {
  RetrievalArmsBar,
  RetrievalArmsLegend,
  armShares,
  type RetrievalArms,
} from './RetrievalArmsBar';
export { JsonDiff, diffKeys, type DiffEntry, type DiffStatus } from './JsonDiff';
export { Sparkline, buildPath } from './Sparkline';

/**
 * Charts are exported as a pair: `Figure` renders a mark beside the table it was
 * drawn from, and the marks are only meaningful inside it. An eslint rule keeps
 * a page from importing a mark directly and hand-rolling the pairing.
 */
export { Figure } from './Figure';
export { BarSeries, shares, type Bar } from './BarSeries';

/**
 * The usable form of the pairing, and the one a screen should reach for.
 *
 * `Figure` takes its mark as a prop while the marks are unimportable outside this
 * package, so a screen cannot build one — which is most likely why the chart
 * primitives had no consumers for as long as they did. This composite is the
 * sanctioned route: same data twice, no prop that drops the table.
 */
export { BarFigure } from './BarFigure';
