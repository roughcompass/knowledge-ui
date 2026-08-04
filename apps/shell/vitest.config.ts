import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The host's test project, and the file whose absence was a loaded gun.
 *
 * Both remote configs spend a paragraph warning about exactly this: the root config
 * globs `projects: ['packages/*', 'apps/*', 'remotes/*']`, so a workspace without a
 * `vitest.config.ts` resolves against its `vite.config.ts` instead — **with the
 * Module Federation plugin loaded** — and inherits vitest's default
 * `environment: 'node'`. The failure surfaces inside the user-event library as a
 * missing document symbol, which names nothing that points at the cause.
 *
 * This workspace was in that state and it was invisible, because it had no tests at
 * all: twelve files, none of them covered, and the first test added would have hit
 * the trap the sibling configs predicted. So this comes first, before any test is
 * written, rather than being discovered by writing one.
 *
 * Includes `.test.ts` as well as `.test.tsx`, because several of the host's twelve
 * files are plain modules — the basename resolver and the remote descriptor table —
 * and a glob that only matched components would have left them uncovered while
 * looking complete.
 *
 * Deliberately not the app's `vite.config.ts`: a component test wants React's JSX
 * transform and nothing else. Federation is a build concern, and the boundary it
 * creates is covered by the Playwright lane against the real artefacts.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'shell',
    environment: 'jsdom',
    setupFiles: ['../../vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
