import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The second jsdom project, added for the same reason the first one warns about.
 *
 * `remotes/operations/vitest.config.ts` documents the trap: the root config globs
 * `projects: ['packages/*', 'apps/*', 'remotes/*']`, so a workspace without its own
 * `vitest.config.ts` resolves against `vite.config.ts` instead — **with the Module
 * Federation plugin loaded** — and inherits vitest's default `environment: 'node'`.
 *
 * That prediction came true here. The first `.test.tsx` in this workspace failed
 * inside `@testing-library/user-event`'s `prepareDocument` with a missing document
 * symbol, which reads as a testing-library problem and is actually a missing DOM.
 * Worth recording, because the error names nothing that points at this file.
 *
 * Deliberately not the app's `vite.config.ts`: a component test wants React's JSX
 * transform and nothing else. Federation is a build concern, and the boundary it
 * creates is covered by the Playwright lane against the real artefacts.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'remote-catalog',
    environment: 'jsdom',
    // Shared with the other jsdom projects rather than copied per workspace.
    setupFiles: ['../../vitest.setup.ts'],
    include: ['src/**/*.test.tsx'],
  },
});
