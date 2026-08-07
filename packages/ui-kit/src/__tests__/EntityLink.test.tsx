/**
 * The affordance contract: everything clickable this component renders carries
 * the accent, and everything it renders as plain text does not. The failure
 * this guards against is inversion — link and non-link branches identical at
 * rest, so the only clickable thing in a table read as body text while inert
 * pills beside it wore the colour.
 */
import { renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EntityLink } from '../EntityLink';

const UUID = '0b7a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';

describe('EntityLink', () => {
  it('renders a named destination as an accent link', () => {
    renderWithProviders(<EntityLink id={UUID} name="Web Runtime" to="/catalog/web-runtime" />);

    const link = screen.getByRole('link', { name: 'Web Runtime' });
    expect(link.className).toContain('saltLink-accent');
    expect(link.className).toContain('saltLink-underlineNever');
  });

  it('renders a readable id with a destination as an accent link', () => {
    renderWithProviders(<EntityLink id="salt-design-system" to="/catalog/salt-design-system" />);

    expect(screen.getByRole('link', { name: 'salt-design-system' }).className).toContain(
      'saltLink-accent',
    );
  });

  it('renders a shortened opaque id with a destination as an accent link', () => {
    renderWithProviders(<EntityLink id={UUID} to={`/catalog/${UUID}`} />);

    expect(screen.getByRole('link', { name: UUID.slice(0, 8) }).className).toContain(
      'saltLink-accent',
    );
  });

  it('renders a name with nowhere to go as plain text, not a dressed-up non-link', () => {
    renderWithProviders(<EntityLink id={UUID} name="Web Runtime" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Web Runtime').className).not.toContain('saltLink');
  });
});
