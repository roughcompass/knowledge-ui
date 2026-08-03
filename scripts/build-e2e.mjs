#!/usr/bin/env node
/**
 * Build all three artefacts with the remote URLs wired for the end-to-end lane.
 *
 * This cannot be a plain `npm run build`: each remote must be built knowing its
 * OWN public origin (the host resolves that remote's chunk URLs against it),
 * and the host must be built knowing where each remoteEntry.js will be served
 * from. Those are four environment variables across three builds, which is
 * past the point where a shell one-liner stays readable.
 *
 * By default this produces the **mocked** lane: the interceptor is baked in and
 * the persona switcher is enabled, so the built artefacts run with no backend at
 * all and CI stays green without a registry. `import.meta.env` is substituted at
 * build time, so this is a property of the artefact and cannot be switched on
 * afterwards — hence a build flag rather than a runtime one.
 *
 * `KUI_LIVE=1` builds the same artefacts against the real API instead. That
 * variant deliberately carries no interceptor and no dev credentials.
 */
import { execFileSync } from 'node:child_process';

const LIVE = process.env.KUI_LIVE === '1';

/**
 * Baked into every one of the three builds.
 *
 * The persona secret is passed explicitly because `.env.development` is only
 * loaded in development mode and these are production builds. It is a mock-IdP
 * placeholder, not a credential — but it is also the reason the plain
 * `npm run build` that CI greps must NOT go through this script.
 */
const LANE_ENV = LIVE
  ? {}
  : {
      VITE_MSW: 'on',
      VITE_PERSONA_SWITCHER: 'on',
      VITE_PERSONA_SECRET: 'dev-secret',
    };

const REMOTES = [
  {
    workspace: '@knowledge-ui/remote-catalog',
    origin: 'http://localhost:4271/',
    env: 'VITE_REMOTE_CATALOG',
  },
  {
    workspace: '@knowledge-ui/remote-operations',
    origin: 'http://localhost:4272/',
    env: 'VITE_REMOTE_OPERATIONS',
  },
];

const run = (args, env) => {
  console.log(`  $ npm ${args.join(' ')}`);
  execFileSync('npm', args, { stdio: 'inherit', env: { ...process.env, ...LANE_ENV, ...env } });
};

console.log(`lane: ${LIVE ? 'live (real API, no interceptor)' : 'mocked (no backend required)'}`);

console.log('building remotes');
for (const r of REMOTES) {
  run(['run', 'build', '-w', r.workspace], { VITE_PUBLIC_PATH: r.origin });
}

console.log('building shell');
run(
  ['run', 'build', '-w', '@knowledge-ui/shell'],
  Object.fromEntries(REMOTES.map((r) => [r.env, `${r.origin}remoteEntry.js`])),
);

console.log('\nbuild:e2e complete');
