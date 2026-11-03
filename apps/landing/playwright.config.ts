import { defineConfig, devices } from '@playwright/test';

const STUB_PORT = 8299;
const APP_PORT = 3200;

/** A desktop Chrome user agent: headless Chrome names itself, and the beacon ignores it. */
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/**
 * End-to-end tests of the built app (`next build` first) against the stub landing API.
 * One worker, because the tests share the stub's visit log.
 */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${String(APP_PORT)}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], userAgent: DESKTOP_CHROME } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node e2e/stub-api.mjs',
      url: `http://127.0.0.1:${String(STUB_PORT)}/__visits`,
      env: { STUB_PORT: String(STUB_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `next start --port ${String(APP_PORT)} --hostname 127.0.0.1`,
      url: `http://127.0.0.1:${String(APP_PORT)}/mcp/landing?doi=10.5555/e2e-1`,
      env: { LANDING_API_URL: `http://127.0.0.1:${String(STUB_PORT)}`, LOG_LEVEL: 'warn' },
      reuseExistingServer: false,
    },
  ],
});
