import { LANDING_PATH, type Token } from '@scholarly-mcp/core';

/**
 * A link from one landing page to another article. With the token it opens another result
 * of the same search; without it, an article by its DOI (related reading is not part of
 * the search). UTM tags are left off: moving between pages is not a new referral.
 */
export function landingHref({ token, doi }: { token?: Token; doi: string }): string {
  const params = new URLSearchParams();
  if (token !== undefined) params.set('t', token);
  params.set('doi', doi);
  return `${LANDING_PATH}?${params.toString()}`;
}
