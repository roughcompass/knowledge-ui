import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * jsdom, because this workspace is the component library.
 *
 * It ran under `environment: 'node'` while its only test covered a pure
 * function, which was true but accidental — the first component test added here
 * failed with `document is not defined`, for a reason that has nothing to do
 * with the component. A library of React components whose test project cannot
 * render one is a trap set for whoever writes that test, and the error points
 * away from the cause.
 *
 * The React plugin is here for the JSX transform and nothing more. Same shape as
 * `remotes/operations`, deliberately: a second jsdom project that configured
 * itself differently would make a test's behaviour depend on which workspace it
 * happened to live in.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'ui-kit',
    environment: 'jsdom',
    setupFiles: ['../../vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
