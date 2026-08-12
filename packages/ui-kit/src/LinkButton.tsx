import { FlexLayout } from '@salt-ds/core';
import { ArrowRightIcon } from '@salt-ds/icons';

import { KLink, type KLinkProps } from './LinkAdapter';

/**
 * A navigation with action prominence.
 *
 * The rule this exists to enforce: **anything that navigates is an anchor, always** —
 * middle-click, "copy link address" and the screen-reader link role are not optional.
 * But a card's call-to-action and a page's primary destination need more visual
 * weight than an inline link carries, and Salt's `Button` cannot become an anchor.
 * So this is `KLink` using Salt's action type and directional icon. The retained
 * `appearance` prop preserves the public API without recreating button CSS.
 *
 * The litmus for choosing between this and `Button`: "Open / View / Browse + noun"
 * navigates and belongs here; "Save / Delete / Run + noun" mutates and stays a real
 * `Button`.
 */
export function LinkButton({
  appearance: _appearance = 'bordered',
  className: _ignored,
  children,
  ...rest
}: KLinkProps & { appearance?: 'bordered' | 'solid' }) {
  return (
    <KLink {...rest} underline="never" color="accent" styleAs="action">
      <FlexLayout as="span" gap={0.5} align="center">
        {children}
        <ArrowRightIcon aria-hidden />
      </FlexLayout>
    </KLink>
  );
}
