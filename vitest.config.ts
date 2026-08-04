import { defineConfig } from 'vitest/config';

/**
 * Root test config, which is a list of projects and nothing else.
 *
 * Deliberately has no federation plugin: a project that resolves against its own
 * `vite.config.ts` picks the plugin up and fails inside federation machinery for
 * reasons that name nothing about the test. Each workspace that renders into a DOM
 * therefore carries its own config.
 *
 * The `tooling` project is declared inline rather than given a config file of its
 * own because it is not a workspace. It holds the build and lint wiring, which has
 * no package but does have behaviour worth asserting.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      'remotes/*',
      {
        test: {
          name: 'tooling',
          root: '.',
          include: ['tooling/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
