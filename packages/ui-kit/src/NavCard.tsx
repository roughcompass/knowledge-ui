import { Card, FlexLayout, FlowLayout, StackLayout } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { CardHeading } from './CardHeading';
import { KLink } from './LinkAdapter';

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
  visual,
  links,
}: {
  /** Where the card itself goes. */
  to: string;
  title: string;
  description?: ReactNode;
  /** Salt icon treatment that distinguishes this product area. */
  visual?: ReactNode;
  /**
   * The pages inside this destination, each a real link.
   *
   * Capped by the caller — a card that lists everything has told the reader
   * nothing, and the rail is one glance away.
   */
  links?: readonly { label: string; to: string }[];
}) {
  return (
    <Card hoverable>
      <FlexLayout gap={2} align="start">
        {visual}
        <StackLayout gap={2}>
          <CardHeading
            title={
              <KLink to={to} underline="default" color="primary">
                {title}
              </KLink>
            }
            description={description}
            headingLevel="h3"
            scale="tile"
          />
          {links && links.length > 0 ? (
            <FlowLayout gap={1}>
              {links.map((link) => (
                <KLink key={link.to} to={link.to} underline="default" color="accent">
                  {link.label}
                </KLink>
              ))}
            </FlowLayout>
          ) : null}
        </StackLayout>
      </FlexLayout>
    </Card>
  );
}
