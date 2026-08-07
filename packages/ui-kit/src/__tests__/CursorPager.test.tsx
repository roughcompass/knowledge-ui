/**
 * The pager's own honesty rules: the count states only what the response
 * supports, and it steps aside when the empty state above it already says
 * everything it would.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CursorPager } from '../CursorPager';

const noop = vi.fn();

describe('CursorPager', () => {
  it('states the count and finality for an unpageable non-empty result', () => {
    render(
      <CursorPager canPrev={false} canNext={false} onPrev={noop} onNext={noop} showingCount={1} />,
    );

    expect(screen.getByText('Showing 1 row — this is the whole result')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing for an empty first page', () => {
    // The empty state directly above already announces it; "Showing 0 rows —
    // this is the whole result" beneath "No workspaces" says the same fact
    // twice in two registers.
    const { container } = render(
      <CursorPager canPrev={false} canNext={false} onPrev={noop} onNext={noop} showingCount={0} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the count and the way back after paging past the end', () => {
    // Zero rows with a back cursor is a different situation: the reader walked
    // forward past the last page, no empty state renders, and Previous is the
    // way home.
    render(
      <CursorPager canPrev={true} canNext={false} onPrev={noop} onNext={noop} showingCount={0} />,
    );

    expect(screen.getByText(/Showing 0 rows/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('offers both buttons while pageable', () => {
    render(
      <CursorPager canPrev={false} canNext={true} onPrev={noop} onNext={noop} showingCount={20} />,
    );

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByText('Showing 20 rows')).toBeInTheDocument();
  });
});
