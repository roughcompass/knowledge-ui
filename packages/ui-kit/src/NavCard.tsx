import { FlowLayout, LinkCard, StackLayout, Tag, Text } from '@salt-ds/core';
import type { MouseEvent, ReactNode } from 'react';

import styles from './NavCard.module.css';

/**
 * A card that is genuinely a link.
 *
 * `LinkCard` renders an anchor, so it gets a real `href` — that is what makes
 * middle-click, "copy link address" and the screen-reader link role work. A plain
 * click is handed to `onNavigate` for client-side routing; modified clicks are left
 * alone so the browser can do what the reader actually asked for.
 *
 * Lives in ui-kit rather than beside the one page that uses it, because ui-kit is
 * the only workspace permitted a stylesheet and the at-rest chrome needs one — see
 * the module CSS.
 *
 * Router-free by the same convention as `SidebarBack`: the caller resolves the
 * `href` and handles the navigation, so ui-kit takes no dependency on
 * react-router.
 */
export function NavCard({
  href,
  onNavigate,
  title,
  description,
  tags,
}: {
  /** Already resolved against the router basename by the caller. */
  href: string;
  /** Called for an unmodified left click, with `preventDefault` already applied. */
  onNavigate: () => void;
  title: string;
  description?: ReactNode;
  /**
   * What this destination holds, as short noun phrases.
   *
   * A description says what a section is for; these say what is *in* it, which is
   * the question a reader arriving cold actually has. Nouns rather than sentences,
   * because a row of them is scanned rather than read — and capped by the caller,
   * since a card that lists everything has told the reader nothing.
   */
  tags?: readonly string[];
}) {
  return (
    <LinkCard
      className={styles.card}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        // Anything the browser has a better answer for — new tab, new window,
        // download — is left to the browser.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onNavigate();
      }}
    >
      <StackLayout gap={1}>
        <Text styleAs="label">{title}</Text>
        {description !== undefined ? <Text color="secondary">{description}</Text> : null}
        {tags && tags.length > 0 ? (
          <FlowLayout gap={1}>
            {tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </FlowLayout>
        ) : null}
      </StackLayout>
    </LinkCard>
  );
}
