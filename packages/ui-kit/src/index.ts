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
