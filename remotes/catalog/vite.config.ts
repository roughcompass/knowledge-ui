import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import { devProxy } from '../../dev-proxy';
import { shared } from '../../mf.shared';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // In production the host resolves this remote's chunk URLs against this
  // value, so it must be the remote's OWN public origin — not the host's.
  base: process.env.VITE_PUBLIC_PATH ?? '/',

  plugins: [
    react(),
    federation({
      name: 'catalog',
      filename: 'remoteEntry.js',
      exposes: {
        // The only public surface. Everything else stays private to the remote.
        './App': './src/expose/App.tsx',
      },
      shared,
      dev: { remoteHmr: true },
      dts: false,
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
    port: 5171,
    strictPort: true,
    // The shell fetches remoteEntry.js cross-origin. Vite's defaults permit
    // localhost, but naming the origin documents the coupling and survives a
    // hostname change.
    cors: { origin: ['http://localhost:5170'] },
    // Only reached when this remote runs standalone; federated code executes on
    // the shell's page and uses the shell's proxy.
    proxy: devProxy(),
  },

  preview: {
    port: 4271,
    strictPort: true,
    cors: { origin: ['http://localhost:4270'] },
    proxy: devProxy(),
  },

  build: {
    target: 'chrome89',
    sourcemap: true,
  },
});
