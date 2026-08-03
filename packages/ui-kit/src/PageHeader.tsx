import { FlexLayout, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

import { Prose } from './Layout';
import styles from './PageHeader.module.css';

/**
 * The title block every screen opens with.
 *
 * Exists so headings are consistent and so no screen reaches for a raw <h1>:
 * Salt's Text carries the type scale, and a bare heading element would render
 * outside it.
 *
 * The title draws `styleAs="h2"` while staying an `<h1>` element. That is a token
 * choice, not an override: at this density `h2` resolves to 24px/32px, which is
 * exactly the reference's page title, where `h1` is 32px/42px and noticeably
 * oversized against 14px body text.
 *
 * `description` and `metadata` are separate props rather than one polymorphic slot.
 * There was one slot, branching on `typeof description === 'string'` to decide
 * whether to apply a prose measure — and it was wrong in both directions. A caller
 * passing a sentence *with emphasis* got a fragment, so it skipped the wrapper and
 * `StackLayout`'s flex column turned each of its four children into its own line:
 * "Tenant", then the tenant name, then "· role", then the role. A caller passing a
 * row of `Tag`s got the wrapper and had its chips squeezed into a 68ch measure meant
 * for running text.
 *
 * The real distinction is what the content *is*, so the props say so:
 *
 *   description  running text. Always measured, always secondary, always inline.
 *   metadata     chips, status, counts. Laid out by the caller, no measure.
 */
export function PageHeader({
  title,
  description,
  metadata,
  actions,
}: {
  title: string;
  /** A sentence. Emphasis is fine; block-level children are not. */
  description?: ReactNode;
  /** A row of `Tag`s or similar, rendered exactly as given. */
  metadata?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <StackLayout gap={1}>
      <FlexLayout gap={2} align="center" justify="space-between">
        <Text className={styles.title} styleAs="h2" as="h1">
          {title}
        </Text>
        {actions}
      </FlexLayout>
      {description !== undefined ? (
        // Measured, because several callers pass a full sentence of explanation and
        // it otherwise ran the width of the viewport.
        <Prose>
          <Text color="secondary">{description}</Text>
        </Prose>
      ) : null}
      {metadata}
    </StackLayout>
  );
}
