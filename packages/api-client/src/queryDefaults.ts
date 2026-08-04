import { keepPreviousData } from '@tanstack/react-query';

/**
 * Defaults every list read shares, so paging behaves the same everywhere.
 *
 * One module rather than a constant per file: this was defined identically in two
 * places, and two copies of a caching policy drift in the direction of whichever
 * one somebody edited while debugging a single screen.
 */
export const LIST_OPTIONS = {
  // Keeps the previous page on screen while the next one loads, so paging does
  // not flash an empty table. v5 spells this as a placeholder rather than the
  // old keepPreviousData flag.
  placeholderData: keepPreviousData,
  staleTime: 30_000,
} as const;
