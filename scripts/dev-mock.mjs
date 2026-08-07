#!/usr/bin/env node
/**
 * The three dev servers, with the request interceptor switched on.
 *
 * `npm run dev` needs a registry, a mock identity provider and an entitlement
 * service running before the app gets past resolving a session. That is the
 * right default for working against real data, and the wrong one for reading a
 * screen, reviewing a change, or opening the app on a machine that has never run
 * the backend. This lane needs none of the three.
 *
 * The interception is the same set of handlers the end-to-end lane and the unit
 * suite run against, so what you see here is what CI asserts — including the
 * token endpoint, which is why the persona switcher works with no identity
 * provider anywhere.
 *
 * A script rather than an inline `VITE_MSW=on npm run dev`, for the reason
 * `build-e2e.mjs` is one: an environment prefix in a package script is POSIX
 * syntax, and this repo's setup instructions do not claim a shell.
 *
 * Hot reloading is unaffected — the handlers are a service worker in front of
 * the network, not a different build.
 */
import { spawn } from 'node:child_process';

console.log('lane: mocked (no registry, identity provider or entitlement service required)');
console.log('      data is fixture data — the same set the tests assert against');
console.log('      the standalone remote harnesses on :5171 and :5172 still need a backend\n');

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_MSW: 'on' },
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  // Mirrors the child rather than reporting success: a dev server killed by
  // Ctrl-C exits on a signal, and a wrapper that swallowed that would make a
  // crashed server look like a clean shutdown to anything watching this process.
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
