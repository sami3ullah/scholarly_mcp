import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/**
 * The reference landing app (ADR 0032). Every landing page is personal to a search, so no
 * route may be indexed: the header backs up the `noindex` meta tag. `LANDING_STANDALONE=true`
 * builds the self-contained server the image runs (ADR 0038); `next start` refuses that output,
 * so it stays off by default. Tracing starts at the repository root to find workspace packages.
 */
const standalone = process.env['LANDING_STANDALONE'] === 'true';

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pino'],
  ...(standalone && {
    output: 'standalone',
    outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  }),
  headers: () =>
    Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]),
};

export default config;
