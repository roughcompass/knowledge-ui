import { Outlet } from 'react-router-dom';

/**
 * Layout for the operations section.
 *
 * Deliberately empty of navigation. Health, Metrics and the audit log used to be
 * a tab row here, but the shell's rail now drills into this section and lists them
 * itself — the host already has to know them to decide whether the reader is
 * allowed in, so the list lives in its registry rather than being declared twice.
 *
 * Kept as a layout route rather than deleted: it is where anything genuinely
 * shared by the three pages belongs, and removing it would mean rewriting the
 * route table to prove a point.
 */
export function OperationsLayout() {
  return <Outlet />;
}
