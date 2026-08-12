import { Divider, SidePanel, SidePanelProvider, StackLayout } from '@salt-ds/core';
import type { CSSProperties, ReactNode } from 'react';

/**
 * The navigation rail, composed from Salt's `SidePanel`, layout and divider
 * primitives. The library owns its width, spacing, surface, overflow and border
 * rather than a custom rail stylesheet.
 */

export function AppSidebar({
  header,
  search,
  children,
  footer,
  label = 'Main',
  width,
}: {
  header: ReactNode;
  search?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  label?: string;
  /** Dynamic desktop width, expressed through Salt SidePanel's published variable. */
  width?: number;
}) {
  const widthStyle =
    width === undefined ? undefined : ({ '--saltSidePanel-width': `${width}px` } as CSSProperties);

  return (
    <SidePanelProvider defaultOpen>
      <SidePanel
        position="left"
        variant="primary"
        aria-label={label}
        disableAnimation
        style={widthStyle}
      >
        <StackLayout as="nav" aria-label={label} gap={2}>
          {header}
          {search ? (
            <>
              <Divider variant="tertiary" />
              {search}
            </>
          ) : null}
          <Divider variant="tertiary" />
          <StackLayout gap={0}>{children}</StackLayout>
          {footer ? (
            <>
              <Divider variant="tertiary" />
              {footer}
            </>
          ) : null}
        </StackLayout>
      </SidePanel>
    </SidePanelProvider>
  );
}
