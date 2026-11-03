import { visitSchema } from '../../../../features/landing/model/visit';
import { shouldCountVisit } from '../../../../features/landing/model/should-count-visit';
import { landingApiDeps } from '../../../../features/landing/server/landing-api-deps';
import { sendVisit } from '../../../../features/landing/server/send-visit';

/**
 * The referral beacon's endpoint (PLAN.md links and landing pages): the page posts here
 * once a reader's browser has shown it, and the visit goes on to the landing API. Requests
 * from prefetchers, preview bots and other sites are answered the same way but not counted.
 */
export async function POST(request: Request): Promise<Response> {
  const body = visitSchema.safeParse(await request.json().catch(() => undefined));
  if (!body.success) return noContent(400);
  if (shouldCountVisit(request.headers)) {
    await sendVisit(body.data, landingApiDeps(request.headers));
  }
  return noContent(204);
}

function noContent(status: number): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } });
}
