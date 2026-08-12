import { FlexLayout, SaltProviderNext, StackLayout, Text } from '@salt-ds/core';
import type { ReactNode } from 'react';

export interface CardHeadingProps {
  title: ReactNode;
  description?: ReactNode;
  headingLevel: 'h2' | 'h3';
  scale: 'card' | 'tile';
}

/**
 * The title-and-description unit shared by bordered cards.
 *
 * `FlexLayout` owns the semantic heading element because its zero-margin spacing
 * contract also neutralises the browser's native h2/h3 margins. A plain heading
 * with styled text inside it left almost 27px between the title and description:
 * the native margin plus the layout gap. The nested mobile-density provider uses
 * Salt's published 22px h2 for section cards, 16px h4 for tiles, and 16px body copy
 * for card descriptions without application CSS.
 */
export function CardHeading({ title, description, headingLevel, scale }: CardHeadingProps) {
  return (
    <StackLayout gap={scale === 'card' ? 0 : 0.5}>
      <FlexLayout as={headingLevel} gap={0}>
        <SaltProviderNext density="mobile" applyClassesTo="child">
          <Text as="span" styleAs={scale === 'card' ? 'h2' : 'h4'}>
            {title}
          </Text>
        </SaltProviderNext>
      </FlexLayout>
      {description !== undefined ? (
        scale === 'card' ? (
          <SaltProviderNext density="mobile" applyClassesTo="child">
            <Text color="secondary">{description}</Text>
          </SaltProviderNext>
        ) : (
          <Text color="secondary">{description}</Text>
        )
      ) : null}
    </StackLayout>
  );
}
