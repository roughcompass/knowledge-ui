import { defineConfig } from 'vitest/config';

/**
 * Root test config. Deliberately has no federation plugin: tests resolve the
 * remote specifiers through an alias instead, which turns what would be a
 * mocked boundary into a real host-to-remote integration test.
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'remotes/*'],
  },
});
