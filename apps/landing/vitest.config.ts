import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export const config = defineProject({
  plugins: [react()],
  resolve: {
    // `server-only` throws outside React Server Components; tests import server code directly.
    alias: { 'server-only': fileURLToPath(new URL('src/testing/empty.ts', import.meta.url)) },
  },
  test: {
    name: 'landing',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/testing/setup.ts'],
  },
});
export { config as default };
