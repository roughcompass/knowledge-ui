import { Card, Divider, FlexLayout, StackLayout, Text, type CardProps } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { CardHeading } from './CardHeading';

/**
 * A titled section of a page, as a bordered card.
 *
 * Replaces the `StackLayout gap={1}` + `<Text styleAs="h4">` pairing that every
 * page had grown its own copy of. Beyond consistency it fixes a real
 * accessibility detail: those headings were styled text with no `as`, so the
 * document outline was one `h1` and nothing else. The title here is a real
 * heading.
 *
 * Two shapes, because the reference uses two:
 *
 *   default        title, description and content in one body, then a divider,
 *                  then a tinted footer holding a hint and its action. This is
 *                  the settings-panel shape and the common case.
 *   `banded`       a header band with the title and a trailing action, divided
 *                  from the content below. For a card whose content is a list or
 *                  table that should read as a separate register from its title.
 *
 * The default deliberately has *no* divider under the title: a rule between a
 * heading and the thing it names splits one idea into two.
 *
 * `title` is optional. A section that is self-describing — a single table whose
 * caption already names it — should not be given a redundant heading just to fit
 * the component.
 */
export function SectionCard({
  title,
  description,
  visual,
  actions,
  footer,
  banded = false,
  flush = false,
  headingLevel = 'h2',
  variant = 'primary',
  hoverable = false,
  children,
}: {
  title?: string;
  description?: ReactNode;
  /** Icon or compact visual that identifies the section at a glance. */
  visual?: ReactNode;
  /**
   * Trailing controls on the header row, right of the title.
   *
   * Plural, and rendered in a row: a section header commonly carries more than one —
   * a window value beside a link, say — and callers were composing their own
   * `FlexLayout` to get two side by side, each with its own gap. One row here means
   * every header aligns its controls the same way.
   */
  actions?: ReactNode;
  /** Tinted strip below the body: a hint on the left, its action on the right. */
  footer?: ReactNode;
  /** Put the title in its own divided band above the content. */
  banded?: boolean;
  /**
   * Drop the body padding. For a table that should run to the card's edges so
   * its row dividers read as full-width rules.
   */
  flush?: boolean;
  /** Set to `h3` when the section sits under another heading. */
  headingLevel?: 'h2' | 'h3';
  variant?: CardProps['variant'];
  hoverable?: boolean;
  children: ReactNode;
}) {
  /*
   * A description or a trailing control is a header on its own.
   *
   * This used to require a title, which silently dropped both: a single-table page
   * whose `PageHeader` already names the thing has no business repeating that name
   * here, but it still wants the row — one line saying what the table contains, and
   * the window it covers on the right. Passing a description and getting nothing back
   * is the kind of no-op that looks like a styling problem.
   */
  const hasHeading = title !== undefined || description !== undefined || actions !== undefined;

  const heading = hasHeading ? (
    <FlexLayout gap={2} align="start" justify="space-between">
      <FlexLayout gap={2} align={description !== undefined ? 'start' : 'center'}>
        {visual}
        {title !== undefined ? (
          <CardHeading
            title={title}
            description={description}
            headingLevel={headingLevel}
            scale="card"
          />
        ) : description !== undefined ? (
          <Text color="secondary">{description}</Text>
        ) : null}
      </FlexLayout>
      {actions !== undefined ? (
        <FlexLayout gap={1} align="start" wrap>
          {actions}
        </FlexLayout>
      ) : null}
    </FlexLayout>
  ) : null;

  return (
    <Card variant={variant} hoverable={hoverable}>
      <StackLayout gap={flush ? 1 : 2}>
        {banded && heading ? (
          <>
            {heading}
            <Divider variant="tertiary" />
          </>
        ) : null}

        {!banded && heading ? (
          <StackLayout gap={2}>
            {heading}
            {children}
          </StackLayout>
        ) : (
          children
        )}

        {footer !== undefined ? (
          <>
            <Divider variant="tertiary" />
            <FlexLayout gap={2} align="center" justify="space-between" wrap>
              {footer}
            </FlexLayout>
          </>
        ) : null}
      </StackLayout>
    </Card>
  );
}
