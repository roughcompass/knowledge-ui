import { Divider, SidePanel, SidePanelProvider, StackLayout } from '@salt-ds/core';
import type { ReactNode } from 'react';

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
}: {
  header: ReactNode;
  search?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  label?: string;
}) {
  return (
    <SidePanelProvider defaultOpen>
      <SidePanel position="left" variant="primary" aria-label={label} disableAnimation>
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
