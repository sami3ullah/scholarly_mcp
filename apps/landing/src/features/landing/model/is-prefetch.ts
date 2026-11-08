/**
 * Link preview bots and crawlers. Chat apps fetch a shared link to draw its preview, which
 * must not count as a visit (ARCHITECTURE.md links and landing pages).
 */
const PREVIEW_AGENTS =
  /bot\b|crawler|spider|preview|slack|discord|telegram|whatsapp|skypeuripreview|facebookexternalhit|embedly|headless|lighthouse|curl|wget|python-requests/i;

/**
 * True when a request comes from a prefetch, a prerender or a preview agent rather than a
 * reader. Such requests may read a page but never count a visit.
 */
export function isPrefetch(headers: Pick<Headers, 'get'>): boolean {
  const purpose = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''} ${headers.get('x-moz') ?? ''}`;
  if (/prefetch|prerender|preview/i.test(purpose)) return true;
  const agent = headers.get('user-agent');
  return agent === null || agent.trim() === '' || PREVIEW_AGENTS.test(agent);
}
