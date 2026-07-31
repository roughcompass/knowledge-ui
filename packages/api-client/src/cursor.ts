/**
 * Keyset pagination state.
 *
 * A cursor is an opaque urlsafe-base64 blob. It encodes the server's own sort
 * position and nothing here may decode, construct, compare or reason about it —
 * a client that learned its shape would break the first time the server changed
 * the sort key, and the failure would be silently wrong pages rather than an
 * error.
 *
 * The server gives forward links only, so "previous" has to be remembered
 * client-side: a stack of the cursors already visited.
 */

/**
 * Cursors already used, so Prev can walk back.
 *
 * Keyed by a filter signature. Changing a filter invalidates the whole stack —
 * paging back with cursors from a different result set silently shows the wrong
 * rows, which is worse than losing the history. The signature makes that reset
 * automatic rather than something each page has to remember.
 */
export class CursorStack {
  private stack: string[] = [];
  private signature: string;

  constructor(signature = '') {
    this.signature = signature;
  }

  /** Reset when the filters change; no-op when they have not. */
  syncSignature(next: string): boolean {
    if (next === this.signature) return false;
    this.signature = next;
    this.stack = [];
    return true;
  }

  get currentSignature(): string {
    return this.signature;
  }

  get depth(): number {
    return this.stack.length;
  }

  get canGoBack(): boolean {
    return this.stack.length > 0;
  }

  /** Record the cursor of the page being left, then move forward. */
  push(cursorOfCurrentPage: string | null): void {
    // A null cursor is the first page. Pushing a placeholder keeps the depth
    // meaningful so Prev from page two returns to the unparameterised request.
    this.stack.push(cursorOfCurrentPage ?? '');
  }

  /** Step back one page. Returns the cursor to request, or null for the first page. */
  pop(): string | null {
    const previous = this.stack.pop();
    if (previous === undefined || previous === '') return null;
    return previous;
  }

  reset(): void {
    this.stack = [];
  }

  snapshot(): readonly string[] {
    return [...this.stack];
  }
}

/**
 * Build a stable signature from a filter object.
 *
 * Key order must not matter — the same filters spelled in a different order are
 * the same result set, and treating them as different would reset the stack on
 * an unrelated re-render.
 */
export function filterSignature(filters: Record<string, unknown>): string {
  const entries = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`);
  return entries.join('&');
}
