import 'server-only';
import { shouldCountVisit } from '../model/should-count-visit';
import { actionSchema, visitSchema } from '../model/referral';
import { landingApiDeps } from './landing-api-deps';
import { sendReferral, type Referral } from './send-referral';

/**
 * The POST handler for a beacon endpoint (PLAN.md links and landing pages): the page posts
 * here once a reader's browser has shown it or a button was clicked, and the referral goes
 * on to the landing API. Requests from prefetchers, preview bots and other sites are
 * answered the same way but not counted.
 */
export function referralRoute(kind: Referral['kind']) {
  return async function POST(request: Request): Promise<Response> {
    const referral = parse(kind, await request.json().catch(() => undefined));
    if (referral === undefined) return noContent(400);
    if (shouldCountVisit(request.headers)) {
      await sendReferral(referral, landingApiDeps(request.headers));
    }
    return noContent(204);
  };
}

function parse(kind: Referral['kind'], raw: unknown): Referral | undefined {
  if (kind === 'visit') {
    const body = visitSchema.safeParse(raw);
    return body.success ? { kind, body: body.data } : undefined;
  }
  const body = actionSchema.safeParse(raw);
  return body.success ? { kind, body: body.data } : undefined;
}

function noContent(status: number): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } });
}
