import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import { registryProxy } from '../../tooling/vite/registry-proxy';
import { sharedModules } from '../../tooling/federation/shared-modules';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const CATALOG = process.env.VITE_REMOTE_CATALOG ?? 'http://localhost:5171/remoteEntry.js';
const OPERATIONS = process.env.VITE_REMOTE_OPERATIONS ?? 'http://localhost:5172/remoteEntry.js';

export default defineConfig({
  // The asset base. The router's basename is resolved separately at runtime,
  // because the two are allowed to differ: assets can sit on a CDN path while
  // the app is routed under a different prefix.
  base: process.env.VITE_PUBLIC_PATH ?? '/',

  // One env file for the whole workspace, at the repo root. Without this each
  // app would look only in its own directory and need its own copy.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),

  plugins: [
    react(),
    federation({
      name: 'shell',
      filename: 'remoteEntry.js',
      remotes: {
        catalog: { type: 'module', name: 'catalog', entry: CATALOG },
        operations: { type: 'module', name: 'operations', entry: OPERATIONS },
      },
      shared: sharedModules,
      // Keeps hot reload working across the boundary: editing a file inside a
      // remote refreshes that module inside the running shell.
      dev: { remoteHmr: true },
      // Remote types are hand-written in src/remotes/remotes.d.ts. Generated
      // declarations require the remote's dev server to be reachable during
      // typecheck, which would make `npm run typecheck` depend on a running
      // process.
      dts: false,
      // Emits mf-manifest.json and mf-stats.json. Worth having beyond
      // tooling: the manifest is the only build artefact that proves the
      // federation plugin actually ran, so the bundle-budget check keys off
      // its presence rather than trusting that a build which produced files
      // produced federated ones.
      manifest: true,
    }),
  ],

  resolve: {
    alias: { '@': r('./src') },
    // Belt and braces on top of npm's hoisting. A second physical copy of any
    // of these is the failure mode the whole share contract exists to prevent.
    dedupe: [
      'react',
      'react-dom',
      'react-router',
      'react-router-dom',
      '@tanstack/react-query',
      '@salt-ds/core',
    ],
  },

  optimizeDeps: {
    // The workspace packages are consumed as TypeScript source. Pre-bundling
    // them freezes a copy that survives edits until the cache is cleared by
    // hand, which reads as "my change did nothing".
    exclude: [
      '@knowledge-ui/api-client',
      '@knowledge-ui/auth',
      '@knowledge-ui/remote-contract',
      '@knowledge-ui/testing',
      '@knowledge-ui/ui-kit',
    ],
    // The federation runtime emits top-level await, so the dependency
    // optimizer needs a target that accepts it — same reason as build.target.
    esbuildOptions: { target: 'chrome89' },
  },

  server: {
    port: 5170,
    strictPort: true,
    proxy: registryProxy(),
  },

  preview: {
    port: 4270,
    strictPort: true,
    // The preview server carries the same proxy table so the relative-URL
    // contract still holds in the built-artefact end-to-end lane.
    proxy: registryProxy(),
  },

  build: {
    // Lowest target that accepts top-level await, which the federation runtime
    // emits. Anything lower fails the build outright rather than degrading.
    target: 'chrome89',
    sourcemap: true,
    // Deliberately no rollupOptions.output.manualChunks. The federation plugin
    // owns chunking; a manualChunks entry is accepted by the config schema and
    // then silently ignored, which looks like a working budget control and is
    // not one. Route-level lazy imports are the real splitting lever.
  },
});
