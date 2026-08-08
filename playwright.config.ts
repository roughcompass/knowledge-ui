import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end config for the **built** artefacts.
 *
 * This file did not exist, while `package.json` defined `"e2e": "playwright test"`
 * and CI ran `npm run e2e -- --project=mocked`. The job could never have passed:
 * Playwright exits before running anything when there is no config.
 *
 * The built lane is the only place real Module Federation runs — `vite dev` uses
 * the plugin's `remoteHmr` path instead, so a remote that loads in dev proves
 * nothing about a remote that loads from a different origin over `remoteEntry.js`.
 * `playwright.dev.config.ts` covers the dev-server lane separately.
 *
 * Two projects:
 *
 *   mocked — the default. `build:e2e` bakes in the MSW service worker, so these
 *            specs run with no contextplane at all and CI needs no backend.
 *   live   — the same specs against a real stack, behind `KUI_LIVE=1`. Excluded
 *            by default because the contextplane's entitlement store is in memory and
 *            a cold container fails every persona assertion for a reason that has
 *            nothing to do with the code under test.
 */
const LIVE = process.env.KUI_LIVE === '1';

/** Where the built shell is served. The remotes are booted alongside it. */
const SHELL = 'http://localhost:4270';

export default defineConfig({
  testDir: './e2e/specs',
  // A failing a11y assertion is a real failure, not a flake. Retrying would only
  // hide an intermittent rendering bug behind a green tick.
  retries: 0,
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: SHELL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'mocked',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(LIVE ? [{ name: 'live', use: { ...devices['Desktop Chrome'] } }] : []),
  ],

  /*
   * All three servers, because the shell is useless without its remotes.
   *
   * Each remote waits on its own `remoteEntry.js` rather than on `/`. A remote's
   * index.html is its standalone harness and serves fine even when the federation
   * plugin produced nothing — waiting on the entry file is what actually proves
   * the federated artefact exists before a spec depends on it.
   */
  webServer: [
    {
      command: 'npm run preview -w @knowledge-ui/remote-catalog',
      url: 'http://localhost:4271/remoteEntry.js',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run preview -w @knowledge-ui/remote-operations',
      url: 'http://localhost:4272/remoteEntry.js',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run preview -w @knowledge-ui/shell',
      url: `${SHELL}/remoteEntry.js`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
