/**
 * The panel's opening contract. The failure this guards against: a suggestion
 * control that renders literal nothing after a keystroke, which a reader
 * cannot tell apart from broken — the status row is how "still looking",
 * "nothing matches" and "unavailable" each get said out loud.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SuggestionField } from '../SuggestionPanel';

describe('SuggestionField', () => {
  it('shows no panel when given neither content nor a status', () => {
    render(
      <SuggestionField>
        <input aria-label="Search" />
      </SuggestionField>,
    );

    expect(screen.getByRole('textbox', { name: 'Search' }).parentElement?.childElementCount).toBe(
      1,
    );
  });

  it('opens the panel for a status alone, so zero hits is an answer', () => {
    render(
      <SuggestionField status="No capabilities match — press Enter for the full search">
        <input aria-label="Search" />
      </SuggestionField>,
    );

    expect(
      screen.getByText('No capabilities match — press Enter for the full search'),
    ).toBeInTheDocument();
  });

  it('renders the status beneath the panel content when both are present', () => {
    render(
      <SuggestionField panel={<a href="/catalog/one">one</a>} status="Searching…">
        <input aria-label="Search" />
      </SuggestionField>,
    );

    const link = screen.getByRole('link', { name: 'one' });
    const status = screen.getByText('Searching…');
    expect(link.closest('.saltCard')).not.toBeNull();
    expect(link.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps offering the panel content with no status attached', () => {
    render(
      <SuggestionField panel={<a href="/catalog/one">one</a>}>
        <input aria-label="Search" />
      </SuggestionField>,
    );

    expect(screen.getByRole('link', { name: 'one' })).toBeInTheDocument();
  });
});
