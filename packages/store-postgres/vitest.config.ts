import { defineProject } from 'vitest/config';

export const config = defineProject({
  test: {
    name: 'store-postgres',
    globalSetup: ['src/testing/global-setup.ts'],
    // Starting the container and creating databases takes longer than the default.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
export { config as default };
