import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'testing',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
