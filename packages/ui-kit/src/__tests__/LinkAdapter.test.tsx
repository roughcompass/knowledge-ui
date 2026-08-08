/**
 * A link goes where the app can go, and nowhere else.
 *
 * Link targets in this product are assembled from values the contextplane served,
 * and the contextplane ingests from sync connectors — so a capability's name is
 * upstream content rather than a value this app chose. The router version in
 * use reads a leading `\\host` as protocol-relative, which turns a row in a
 * table into a link off-site. Asserted on the rendered `href`, because that is
 * what a reader's browser acts on, and because the published advisory for this
 * router is exactly this shape.
 */
import { renderWithProviders } from '@knowledge-ui/testing';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KLink } from '../LinkAdapter';

const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

describe('KLink', () => {
  it('leaves an ordinary internal path alone', () => {
    renderWithProviders(<KLink to="/catalog/salt-design-system">Salt</KLink>);
    expect(hrefOf('Salt')).toBe('/catalog/salt-design-system');
  });

  it('escapes a backslash, so a served name cannot become another origin', () => {
    renderWithProviders(<KLink to={'/catalog/\\\\evil.example'}>Injected</KLink>);

    const href = hrefOf('Injected');
    expect(href).not.toContain('\\');
    expect(href).toContain('%5C');
  });

  it('keeps a protocol-relative target on this origin', () => {
    renderWithProviders(<KLink to="//evil.example/catalog">Injected</KLink>);
    expect(hrefOf('Injected')).toBe('/evil.example/catalog');
  });

  it('does not disturb a relative segment that legitimately climbs', () => {
    renderWithProviders(<KLink to="../claims/0b7a1c2d">Claim</KLink>);
    expect(hrefOf('Claim')).toBe('../claims/0b7a1c2d');
  });
});
