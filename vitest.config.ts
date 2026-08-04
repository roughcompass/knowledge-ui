import { defineConfig } from 'vitest/config';

/**
 * Root test config, which is a list of projects and nothing else.
 *
 * Deliberately has no federation plugin: a project that resolves against its own
 * `vite.config.ts` picks the plugin up and fails inside federation machinery for
 * reasons that name nothing about the test. Each workspace that renders into a DOM
 * therefore carries its own config — and the host's is where the federated
 * specifiers are aliased to the remotes' sources, so the boundary is mounted for
 * real rather than mocked.
 *
 * The `tooling` project is declared inline rather than given a config file of its
 * own because it is not a workspace. It holds the build and lint wiring, which has
 * no package but does have behaviour worth asserting.
 */
export default defineConfig({
  test: {
    /**
     * Coverage as a ratchet, not a wall.
     *
     * The tool was installed and never used: no threshold, no reporter, no step in
     * CI. So "we have tests" was a claim with no number behind it, and the parts
     * with none — an entire workspace, and most of the component kit — were
     * invisible.
     *
     * The thresholds sit a point below the measured baseline, which is deliberately
     * unambitious. A number set where the code actually is cannot be argued with
     * and cannot be skipped; a number set where the code ought to be gets raised
     * to the ceiling by the first person it blocks. The point of headroom is so an
     * unrelated change does not fail on rounding noise. Raised once when the host workspace went from no tests to covered, then lowered
     * slightly — which needs explaining, because a falling threshold usually means
     * something got worse and here it means the opposite.
     *
     * Aliasing the federation boundary made the host mount the remotes' real sources,
     * so their whole route tree is now *loaded* during the host's tests. The coverage
     * tool reports files it saw, so roughly two hundred statements that were
     * previously invisible to the report entered the denominator — mostly pages the
     * mount reaches through a router without exercising. Nothing became less covered;
     * the measurement stopped flattering itself by only counting what it happened to
     * import. These numbers are set from the wider, more honest denominator.
     *
     * Excludes are things nobody hand-writes or that another lane covers: the
     * generated client, build output, config, the standalone development harnesses,
     * and the end-to-end specs — which run against built artefacts, so counting
     * them here would credit source they never import.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      thresholds: { statements: 65, branches: 57, functions: 64, lines: 67 },
      exclude: [
        '**/generated/**',
        '**/dist/**',
        '**/dist-types/**',
        '**/*.config.{ts,mjs}',
        '**/*.d.ts',
        '**/__tests__/**',
        'e2e/**',
        'scripts/**',
        'tooling/**',
        '**/standalone.tsx',
        '**/standalone/**',
      ],
    },
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
