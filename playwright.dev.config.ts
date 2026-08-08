import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end config for the **dev servers**, against a real contextplane.
 *
 * This is the file `package.json`'s `e2e:dev` script and the built config's
 * docstring have both referenced since they were written, and which did not
 * exist — so `npm run e2e:dev` exited before running anything. That is the exact
 * failure the built config's own header describes having just fixed, one file
 * over, and it stayed open.
 *
 * ## What this lane is for, and what it cannot tell you
 *
 * The built lane is the one that exercises real Module Federation: `vite dev`
 * serves remotes through the plugin's `remoteHmr` path, so a remote that mounts
 * here proves nothing about a remote loaded from another origin over
 * `remoteEntry.js`. Nothing in this lane should be trusted as evidence about the
 * federation boundary.
 *
 * What it *does* cover is the half the mocked lane cannot: request and response
 * shapes against the live service, the identity chain end to end, and the role
 * gates as the API actually enforces them rather than as the request mocks
 * describe them. The mocked lane's handlers are hand-written, so they agree with
 * the server exactly as far as somebody kept them in step — this is what notices
 * when they stop.
 *
 * ## It needs a stack, and it says so before failing
 *
 * Three services: the contextplane, a mock identity provider, and the entitlement
 * service. Run `npm run doctor` first — the entitlement store is in memory, so a
 * restarted container answers every request with a bare 403 that looks like a
 * broken role gate and is a lost seed. The `webServer` entries wait on the dev
 * servers only; the backing services are checked by the specs' own setup, because
 * a Playwright timeout on a URL it cannot reach names the port and nothing else.
 *
 * Deliberately not in CI. It cannot be: the workflow provisions no contextplane, and
 * a lane that only passes when a backend happens to be running is a lane whose
 * failures get ignored. It is a local and pre-release check, run on purpose.
 */

/** Where `vite dev` serves the shell. The remotes are booted alongside it. */
const SHELL = 'http://localhost:5170';

export default defineConfig({
  testDir: './e2e/specs',
  // Same reasoning as the built lane: an accessibility or gating assertion that
  // passes on the second try is a bug that reproduces intermittently, not a flake
  // worth papering over.
  retries: 0,
  // Serial. The specs mutate real contextplane state — a sync source created by one
  // and deactivated by another is a race that would only ever fail in this lane,
  // where the store is shared rather than per-worker.
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: SHELL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'dev', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run dev -w @knowledge-ui/remote-catalog',
      url: 'http://localhost:5171/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @knowledge-ui/remote-operations',
      url: 'http://localhost:5172/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @knowledge-ui/shell',
      url: SHELL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
