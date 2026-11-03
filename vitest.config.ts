import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/**',
        'packages/search/src/**',
        'packages/cite/src/**',
        'packages/card-view/src/**/*.ts',
        'packages/logger/src/**',
        'packages/lexical/src/**',
        'packages/http/src/**',
        'packages/source-*/src/**',
        'packages/embedder-*/src/**',
        'packages/store-*/src/**',
        'apps/ingest/src/**',
        'apps/eval/src/**',
        'apps/server/src/**',
        'apps/landing/src/**',
      ],
      exclude: [
        '**/index.ts',
        '**/main.ts',
        '**/*.test.{ts,tsx}',
        '**/testing/**',
        // Thin Next.js route files, covered by the Playwright suite.
        'apps/landing/src/app/**',
      ],
      thresholds: { lines: 85 },
    },
  },
});
