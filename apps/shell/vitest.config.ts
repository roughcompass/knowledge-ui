import { fileURLToPath } from 'node:url';

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
 * transform and nothing else. Federation is a *build* concern, and the runtime half
 * of the boundary — fetching a remote entry from another origin — is covered by the
 * Playwright lane against real artefacts.
 *
 * ## The alias, which two comments claimed existed and nothing provided
 *
 * `lazy.ts` and the root test config both said the boundary was aliased away in
 * tests so the host mounted a remote's real source. It was not: no alias existed
 * anywhere, so the claim described a test nobody had written and the only coverage
 * of the boundary was the built lane.
 *
 * It exists now, and it buys the half Playwright cannot reach cheaply: whether the
 * props the host passes are the props a remote accepts, checked by actually mounting
 * one. That is a different question from "does the remote entry load", and it is the
 * question the contract package exists to answer.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    /*
     * The federated specifiers, pointed at the remotes' real sources. In a build the
     * plugin rewrites these to fetch a remote entry over the network; here they
     * resolve to the module that entry would have served, so a mount test exercises
     * the same component the shell would have received.
     */
    alias: {
      'catalog/App': fileURLToPath(
        new URL('../../remotes/catalog/src/expose/App.tsx', import.meta.url),
      ),
      'operations/App': fileURLToPath(
        new URL('../../remotes/operations/src/expose/App.tsx', import.meta.url),
      ),
    },
  },
  test: {
    name: 'shell',
    environment: 'jsdom',
    setupFiles: ['../../vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
