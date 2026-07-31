#!/usr/bin/env node
/**
 * Build all three artefacts with the remote URLs wired for the end-to-end lane.
 *
 * This cannot be a plain `npm run build`: each remote must be built knowing its
 * OWN public origin (the host resolves that remote's chunk URLs against it),
 * and the host must be built knowing where each remoteEntry.js will be served
 * from. Those are four environment variables across three builds, which is
 * past the point where a shell one-liner stays readable.
 */
import { execFileSync } from 'node:child_process';

const REMOTES = [
  { workspace: '@knowledge-ui/remote-catalog', origin: 'http://localhost:4271/', env: 'VITE_REMOTE_CATALOG' },
  { workspace: '@knowledge-ui/remote-operations', origin: 'http://localhost:4272/', env: 'VITE_REMOTE_OPERATIONS' },
];

const run = (args, env) => {
  console.log(`  $ npm ${args.join(' ')}`);
  execFileSync('npm', args, { stdio: 'inherit', env: { ...process.env, ...env } });
};

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
