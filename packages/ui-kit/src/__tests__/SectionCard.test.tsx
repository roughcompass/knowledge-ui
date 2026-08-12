import { renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionCard } from '../SectionCard';

describe('SectionCard', () => {
  it('uses the card title scale without native heading margins', () => {
    renderWithProviders(
      <SectionCard title="Trust summary" description="What the registry currently serves.">
        <div>Card body</div>
      </SectionCard>,
    );

    const heading = screen.getByRole('heading', { level: 2, name: 'Trust summary' });
    const title = heading.querySelector('.saltText');
    const titleGroup = heading.parentElement;

    expect(heading.tagName).toBe('H2');
    expect(heading.className).toContain('saltFlexLayout');
    expect(heading.style.getPropertyValue('--flexLayout-margin')).toBe(
      'calc(var(--salt-spacing-100) * 0)',
    );
    expect(title?.className).toContain('saltText-h2');
    expect(title?.className).toContain('salt-density-mobile');
    expect(titleGroup?.style.getPropertyValue('--stackLayout-gap')).toBe(
      'calc(var(--salt-spacing-100) * 0)',
    );
    expect(screen.getByText('What the registry currently serves.').className).toContain(
      'saltText-secondary',
    );
  });

  it('preserves a nested card heading level', () => {
    renderWithProviders(
      <SectionCard title="Nested register" headingLevel="h3">
        <div>Card body</div>
      </SectionCard>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Nested register' }).tagName).toBe('H3');
  });
});
