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
 * Salt's published 20px h3 and 16px h4 steps without application CSS.
 */
export function CardHeading({ title, description, headingLevel, scale }: CardHeadingProps) {
  return (
    <StackLayout gap={0.5}>
      <FlexLayout as={headingLevel} gap={0}>
        <SaltProviderNext density="mobile" applyClassesTo="child">
          <Text as="span" styleAs={scale === 'card' ? 'h3' : 'h4'}>
            {title}
          </Text>
        </SaltProviderNext>
      </FlexLayout>
      {description !== undefined ? <Text color="secondary">{description}</Text> : null}
    </StackLayout>
  );
}
