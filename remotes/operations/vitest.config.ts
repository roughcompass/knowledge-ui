import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The first jsdom project in this repo.
 *
 * **This file has to exist, and its absence was not harmless.** The root config globs
 * `projects: ['packages/*', 'apps/*', 'remotes/*']`, and this workspace had no
 * `vitest.config.ts` — so the project resolved against `vite.config.ts` instead,
 * **with the Module Federation plugin loaded**, and inherited vitest's default
 * `environment: 'node'`. That was invisible only because there were no test files
 * here. The first `.test.tsx` added without this would have run federation machinery
 * in a DOM-less environment and failed for reasons unrelated to the component.
 *
 * Deliberately not the app's `vite.config.ts`: a component test wants React's JSX
 * transform and nothing else. Federation is a build concern, and the boundary it
 * creates is covered by the Playwright lane against the real artefacts.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'remote-operations',
    environment: 'jsdom',
    // Shared with any future jsdom project rather than copied per workspace.
    setupFiles: ['../../vitest.setup.ts'],
    include: ['src/**/*.test.tsx'],
  },
});
