import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'remote-contract',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
