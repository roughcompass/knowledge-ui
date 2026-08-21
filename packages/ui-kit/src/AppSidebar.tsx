import {
  Divider,
  GridLayout,
  SidePanel,
  SidePanelContent,
  SidePanelProvider,
  StackLayout,
} from '@salt-ds/core';
import type { CSSProperties, ReactNode } from 'react';

/**
 * The navigation rail, composed from Salt's `SidePanel`, layout and divider
 * primitives. The library owns its width, spacing, surface, overflow and border
 * rather than a custom rail stylesheet.
 */

export function AppSidebar({
  header,
  children,
  footer,
  label = 'Main',
  width,
  compact = false,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  label?: string;
  /** Dynamic desktop width, expressed through Salt SidePanel's published variable. */
  width?: number;
  /** Use the reference's 72px icon rail at tablet widths. */
  compact?: boolean;
}) {
  const widthStyle = {
    ...(width === undefined ? {} : { '--saltSidePanel-width': `${width}px` }),
    '--appSidebar-inlineGutter': compact
      ? 'calc(var(--salt-spacing-100) * 2 / 3)'
      : 'calc(var(--salt-spacing-100) * 4 / 3)',
    '--saltSidePanel-padding': 'var(--salt-spacing-200) 0',
    '--sidePanel-border': 'none',
  } as CSSProperties;

  return (
    <SidePanelProvider defaultOpen>
      <SidePanel
        position="left"
        variant="primary"
        aria-label={label}
        disableAnimation
        style={widthStyle}
      >
        {header !== undefined ? (
          <GridLayout padding="0 var(--appSidebar-inlineGutter)">
            <StackLayout gap={2}>
              {header}
              <Divider variant="tertiary" />
            </StackLayout>
          </GridLayout>
        ) : null}
        <SidePanelContent aria-label={`${label} menu`}>
          <StackLayout as="nav" aria-label={label} gap={0}>
            {children}
          </StackLayout>
        </SidePanelContent>
        {footer ? (
          <GridLayout padding="0 var(--appSidebar-inlineGutter)">
            <StackLayout gap={2}>
              <Divider variant="tertiary" />
              {footer}
            </StackLayout>
          </GridLayout>
        ) : null}
      </SidePanel>
    </SidePanelProvider>
  );
}
