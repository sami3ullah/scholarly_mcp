import type { NextConfig } from 'next';

/**
 * The reference landing app (ADR 0032). Every landing page is personal to a search, so no
 * route may be indexed: the header backs up the `noindex` meta tag.
 */
const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pino'],
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
