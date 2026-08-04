import '@testing-library/jest-dom/vitest';

import { resetAdminStore } from '@knowledge-ui/testing';
import { server } from '@knowledge-ui/testing/server';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Setup for the jsdom projects.
 *
 * At the repo root rather than inside a workspace, so a second package needing a
 * DOM does not fork a copy of this. Referenced by
 * `remotes/operations/vitest.config.ts`.
 *
 * `onUnhandledRequest: 'error'` is not optional. MSW v2 passes an unmatched request
 * through to the real network, which turns a missing handler into a test that
 * sometimes reaches a live server and passes for the wrong reason —
 * `packages/testing/src/msw/server.ts` says the same thing in its own header.
 */
/*
 * jsdom implements no `ResizeObserver`, and Salt's `ViewportProvider` constructs one
 * on mount — so *any* component rendered inside `SaltProviderNext` throws before its
 * own code runs. A no-op is the right stub rather than a measuring polyfill: nothing
 * asserted here depends on an observed size, and a stub that reported fabricated
 * dimensions would invite assertions on layout that jsdom cannot actually compute.
 *
 * `AppSidebar` also uses one, for its scroll fade. That behaviour is asserted in the
 * Playwright lane, against a browser that has a real implementation.
 */
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= NoopResizeObserver;

/*
 * jsdom implements no `Element.scrollIntoView` either. Salt's list controls call it
 * when the active option changes, so opening any `Dropdown` throws without this.
 */
/*
 * Asked as a property descriptor rather than either obvious spelling, both of which
 * are wrong in a way the compiler or the linter catches:
 *
 *   `Element.prototype.scrollIntoView ??= …`  reads the method off its prototype to
 *   test it, which is a detached method reference — the shape `unbound-method` is
 *   there to catch, and indistinguishable from the cases where it is a real bug.
 *
 *   `'scrollIntoView' in Element.prototype`  narrows to `never` on the false branch,
 *   because the DOM lib *declares* the method: TypeScript is describing the standard,
 *   and the standard says it exists. The gap is jsdom's, and no type knows that.
 *
 * The descriptor answers the actual question — does this runtime define it — without
 * reading the value or contradicting the type.
 */
if (Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView') === undefined) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  /*
   * Separate from `resetHandlers`, and this is the trap worth remembering: the sync
   * handlers keep a module-scoped store so a POST is visible to the following GET.
   * `resetHandlers` restores *handlers* and never touches module bindings, so
   * without this a source created in one test appears in the next one's list.
   */
  resetAdminStore();
});

afterAll(() => server.close());
