// Lighthouse CI budgets for the landing page (LCP under 2.5 s, axe clean). It
// audits the built app against the stub API, on mobile settings with simulated throttling.
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:3200/mcp/landing';

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node e2e/serve.mjs',
      startServerReadyPattern: 'Ready in',
      url: [
        `${BASE}?t=LiveLiveLiveLiveLive01&doi=10.5555/e2e-1`,
        `${BASE}?t=ExpiredExpiredExpired1&doi=10.5555/e2e-2`,
      ],
      numberOfRuns: 3,
      chromePath: chromium.executablePath(),
      settings: { chromeFlags: '--headless=new --no-sandbox' },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
