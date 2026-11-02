import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**',
        'packages/search/src/**',
        'packages/logger/src/**',
        'packages/source-*/src/**',
        'packages/embedder-*/src/**',
        'packages/store-*/src/**',
        'apps/ingest/src/**',
        'apps/eval/src/**',
      ],
      exclude: ['**/index.ts', '**/main.ts', '**/*.test.ts', '**/testing/**'],
      thresholds: { lines: 85 },
    },
  },
});
