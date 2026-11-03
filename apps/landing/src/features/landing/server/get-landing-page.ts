import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import type { Doi, Token } from '@scholarly-mcp/core';
import { landingApiDeps } from './landing-api-deps';
import { fetchLandingPage, type LandingResult } from './fetch-landing-page';

/**
 * Resolves a landing link once per request: `generateMetadata` and the page share the
 * result through React's cache, which keys on these two strings.
 */
export const getLandingPage = cache(
  async (token: Token | undefined, doi: Doi | undefined): Promise<LandingResult> =>
    fetchLandingPage(
      { ...(token !== undefined && { token }), ...(doi !== undefined && { doi }) },
      landingApiDeps(await headers()),
    ),
);
