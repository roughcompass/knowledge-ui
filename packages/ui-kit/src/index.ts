export { ContentColumn, Prose } from './Layout';

// App chrome. Shared composition keeps the shell and standalone remotes on the
// same Salt components and interaction patterns.
export { AppShell } from './AppShell';
export { AppSidebar } from './AppSidebar';
export { ScopeSwitcher, RailBrand, type ScopeOption } from './ScopeSwitcher';
export { ScopeBreadcrumb, type BreadcrumbSegment } from './ScopeBreadcrumb';
export { SectionCard } from './SectionCard';
export { SectionHeading } from './SectionHeading';
export { LinkButton } from './LinkButton';
export { StatTile } from './StatTile';
export { StatusLabel } from './StatusLabel';
export { NavCard } from './NavCard';

/**
 * The only anchor in the app.
 *
 * `KLink` is Salt's `Link` with a routing seam; the provider is installed once per
 * bundle because ui-kit is not federated and a context does not cross that boundary.
 * A lint rule bans react-router's `Link` in pages and components so an unstyled
 * anchor cannot come back.
 */
export { KLink, LinkAdapterProvider, type KLinkProps } from './LinkAdapter';

/**
 * A reference to something else in the contextplane: a name and a destination where one
 * is known, a short id with the whole value one keystroke away where it is not. Nine
 * surfaces used to render a bare UUID as their entire answer to "which one".
 */
export { EntityLink } from './EntityLink';

export { SuggestionField } from './SuggestionPanel';

export { PageHeader } from './PageHeader';
export { FilterBar, FilterField, popoverOverlayProps } from './FilterBar';

/**
 * The window a page is reporting on: the logic, the controls, and the value a reader
 * clicks to change it. One definition, because two panels disagreeing about where a
 * quarter starts is invisible until someone reconciles two exports.
 */
export { DateRangeControls } from './DateRangeControls';
export { DateRangeValue } from './DateRangeValue';
export {
  PERIODS,
  customRangeProblem,
  formatDayRange,
  periodLabel,
  periodRange,
  resolveWindow,
  todayAsDay,
  type DayRange,
  type PeriodId,
  type WindowSelection,
} from './dateRange';

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
export { displayText } from './displayText';
export { instantText } from './instantText';
export { isoDay } from './isoDay';
export { termText } from './termText';

/**
 * Display formatting for served quantities. Rounding and unit conversion are
 * presentation of a value the API served — never derivation of one it did not.
 * Each returns `undefined` for a value it cannot honestly render, so the caller
 * keeps its own absence marker instead of showing a fake zero.
 */
export { countText } from './countText';
export { durationText } from './durationText';
export { bytesText } from './bytesText';
export { TileGrid } from './TileGrid';

/**
 * A main column with an aside. The only multi-column page arrangement in the kit,
 * named once so four pages do not each derive their own grid.
 */
export { PageColumns } from './PageColumns';
export { DataTable, type Column, type DataTableProps } from './DataTable';

/**
 * Metadata, which is not tabular data.
 *
 * A table claims its rows are comparable; a heterogeneous set of fields about one
 * thing is not, and column headers called "Key" and "Value" invite a reader to scan
 * a column that means nothing. See its docstring for the three-way split between
 * this, a table, and an entity row.
 */
export { DescriptionList, type Description } from './DescriptionList';
export { CursorPager } from './CursorPager';
export { CopyButton } from './CopyButton';
export {
  RetrievalArmsBar,
  RetrievalArmsLegend,
  armShares,
  type RetrievalArms,
} from './RetrievalArmsBar';
export { JsonDiff, diffKeys, type DiffEntry, type DiffStatus } from './JsonDiff';

/**
 * Charts are exported as a pair: `Figure` renders a mark beside the table it was
 * drawn from, and the marks are only meaningful inside it. An eslint rule keeps
 * a page from importing a mark directly and hand-rolling the pairing.
 */
export { Figure } from './Figure';
export { LazyColumnChart } from './LazyColumnChart';
export { tickInterval, compactNumber, type Bar } from './ColumnChart';

/**
 * The usable form of the pairing, and the one a screen should reach for.
 *
 * `Figure` takes its mark as a prop while the marks are unimportable outside this
 * package, so a screen cannot build one — which is most likely why the chart
 * primitives had no consumers for as long as they did. This composite is the
 * sanctioned route: same data twice, no prop that drops the table.
 */
export { BarFigure } from './BarFigure';
