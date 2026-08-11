import { FlexItem, FlexLayout, FormField, FormFieldLabel } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * Props for the popover panel of any `Dropdown` or `ComboBox` in the app.
 *
 * Exported as the common extension point passed to every Salt dropdown. It is
 * intentionally empty while Salt owns the complete popover presentation:
 *
 *     <Dropdown bordered OverlayProps={popoverOverlayProps} …>
 */
export const popoverOverlayProps = {};

/**
 * A row of filter controls above a table.
 *
 * Exists because this row was written out twice — in `CapabilityListPage` and
 * `AuditLogPage` — down to a verbatim copy of the comment explaining why it is not
 * a Salt `Toolbar`. That comment now lives here, once.
 *
 * `Toolbar` is the component this looks like it should be, and it does not work.
 * It requires `Tooltray` children, and `Tooltray` computes `flex: 0 0 auto`: it
 * sizes to its content and will not grow, so the fields collapsed to fit a 352px
 * tray inside a 1199px bar. `Toolbar` is built for compact groups of actions, not
 * for a form row that should span the column.
 *
 * Salt owns the control borders and responsive wrapping.
 */
export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FlexLayout gap={2} align="end" wrap role="group" aria-label={label}>
      {children}
    </FlexLayout>
  );
}

/**
 * One labelled control in a `FilterBar`.
 *
 * The `basis` is required, and that is the point. `FormField` is `width: 100%` by
 * design, so three of them in a wrapping `FlexLayout` each claimed a full row — a
 * 1277px search box above two 1277px dropdowns. `FlexItem` is the sanctioned lever
 * for unequal widths, and making the width explicit at every call site is what
 * stops that regression coming back.
 */
export function FilterField({
  label,
  basis,
  grow,
  children,
}: {
  label: string;
  /** Width of this control, e.g. `'22rem'`. */
  basis: string;
  /** Let this control absorb the leftover width. At most one per row. */
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <FlexItem basis={basis} grow={grow === true ? 1 : 0}>
      <FormField>
        <FormFieldLabel>{label}</FormFieldLabel>
        {children}
      </FormField>
    </FlexItem>
  );
}
