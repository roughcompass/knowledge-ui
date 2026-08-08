import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import { contextplaneProxy } from '../../tooling/vite/contextplane-proxy';
import { sharedModules } from '../../tooling/federation/shared-modules';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // In production the host resolves this remote's chunk URLs against this
  // value, so it must be the remote's OWN public origin — not the host's.
  base: process.env.VITE_PUBLIC_PATH ?? '/',

  // One env file for the whole workspace, at the repo root. Without this each
  // app would look only in its own directory and need its own copy.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),

  plugins: [
    react(),
    federation({
      name: 'operations',
      filename: 'remoteEntry.js',
      exposes: {
        // The only public surface. Everything else stays private to the remote.
        './App': './src/expose/App.tsx',
      },
      shared: sharedModules,
      dev: { remoteHmr: true },
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
    exclude: [
      '@knowledge-ui/api-client',
      '@knowledge-ui/auth',
      '@knowledge-ui/remote-contract',
      '@knowledge-ui/testing',
      '@knowledge-ui/ui-kit',
    ],
    esbuildOptions: { target: 'chrome89' },
  },

  server: {
    port: 5172,
    strictPort: true,
    // The shell fetches remoteEntry.js cross-origin. Vite's defaults permit
    // localhost, but naming the origin documents the coupling and survives a
    // hostname change.
    cors: { origin: ['http://localhost:5170'] },
    // Only reached when this remote runs standalone; federated code executes on
    // the shell's page and uses the shell's proxy.
    proxy: contextplaneProxy(),
  },

  preview: {
    port: 4272,
    strictPort: true,
    cors: { origin: ['http://localhost:4270'] },
    proxy: contextplaneProxy(),
  },

  build: {
    target: 'chrome89',
    sourcemap: true,
  },
});
