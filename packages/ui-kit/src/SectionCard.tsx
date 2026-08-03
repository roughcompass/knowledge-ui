import { Card, Divider, FlexLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import styles from './SectionCard.module.css';

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
  action,
  footer,
  banded = false,
  flush = false,
  headingLevel = 'h2',
  children,
}: {
  title?: string;
  description?: ReactNode;
  /** Trailing control on the header row, e.g. a link or a small button. */
  action?: ReactNode;
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
  children: ReactNode;
}) {
  const hasHeading = title !== undefined || action !== undefined;

  const heading = hasHeading ? (
    <FlexLayout gap={2} align="start" justify="space-between">
      <StackLayout gap={1}>
        {title !== undefined ? (
          <Text styleAs="h3" as={headingLevel}>
            {title}
          </Text>
        ) : null}
        {description !== undefined ? <Text color="secondary">{description}</Text> : null}
      </StackLayout>
      {action}
    </FlexLayout>
  ) : null;

  return (
    <Card className={styles.card}>
      {banded && heading ? (
        <>
          <div className={styles.header}>{heading}</div>
          <Divider variant="tertiary" />
        </>
      ) : null}

      <div className={flush ? styles.flush : styles.body}>
        {!banded && heading ? (
          <StackLayout gap={2}>
            {heading}
            {children}
          </StackLayout>
        ) : (
          children
        )}
      </div>

      {footer !== undefined ? (
        <>
          <Divider variant="tertiary" />
          <FlexLayout className={styles.footer} gap={2} align="center" justify="space-between">
            {footer}
          </FlexLayout>
        </>
      ) : null}
    </Card>
  );
}
