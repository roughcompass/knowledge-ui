import { Card, FlowLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { KLink } from './LinkAdapter';
import styles from './NavCard.module.css';

/**
 * A card-shaped destination whose contents are destinations too.
 *
 * This was Salt's `LinkCard` — one big anchor — holding a row of `Tag` pills that
 * *named* real pages while being inert decoration, because HTML forbids an anchor
 * inside an anchor and the constraint was answered by faking the links instead of
 * restructuring the card. A reader who clicked "Claims" got whatever the card's own
 * destination was. That is the worst kind of wrong: it looks interactive, and it is,
 * just not the interaction it promises.
 *
 * Now: a plain `Card`, a title that is the card's anchor stretched over the whole
 * surface (the `::after` overlay in the module CSS — one anchor, full hit area,
 * middle-clickable), and each pill a real link raised above the overlay. Tab order
 * is simply DOM order: title, then pills.
 */
export function NavCard({
  to,
  title,
  description,
  links,
}: {
  /** Where the card itself goes. */
  to: string;
  title: string;
  description?: ReactNode;
  /**
   * The pages inside this destination, each a real link.
   *
   * Capped by the caller — a card that lists everything has told the reader
   * nothing, and the rail is one glance away.
   */
  links?: readonly { label: string; to: string }[];
}) {
  return (
    <Card className={styles.card}>
      <StackLayout gap={1}>
        <Text styleAs="h4" as="h3">
          <KLink to={to} underline="never" color="primary" className={styles.titleLink}>
            {title}
          </KLink>
        </Text>
        {description !== undefined ? <Text color="secondary">{description}</Text> : null}
        {links && links.length > 0 ? (
          <FlowLayout gap={1}>
            {links.map((link) => (
              <KLink
                key={link.to}
                to={link.to}
                underline="never"
                color="accent"
                className={styles.pillLink}
              >
                {link.label}
              </KLink>
            ))}
          </FlowLayout>
        ) : null}
      </StackLayout>
    </Card>
  );
}
