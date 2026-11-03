import { createHash, timingSafeEqual } from 'node:crypto';
import {
  doiSchema,
  isAppError,
  landingActionSchema,
  landingPageSchema,
  tokenSchema,
  toolNameSchema,
} from '@scholarly-mcp/core';
import { z } from 'zod';
import type { RateLimiter } from '../limits/create-rate-limiter.js';
import type { ServerMetrics } from '../telemetry/create-metrics.js';
import type { LandingPages } from './create-landing-pages.js';
import type { Referrals } from './create-referrals.js';

/** Paths of the landing API (ADR 0032). */
export const LANDING_PAGE_PATH = '/landing/v1/page';
export const LANDING_VISITS_PATH = '/landing/v1/visits';
export const LANDING_ACTIONS_PATH = '/landing/v1/actions';

/** The header the landing app names its visitor in, for the per-visitor rate limit. */
export const VISITOR_HEADER = 'x-landing-visitor';

/** Longest visitor id kept; longer ones are cut, so a bucket key stays small. */
const VISITOR_MAX_LENGTH = 64;

const visitSchema = z.strictObject({
  t: tokenSchema,
  /** The result the reader opened (ADR 0033). */
  doi: doiSchema,
  /** The link's `utm_campaign`; used only when the session does not know its tool. */
  tool: z.string().max(40).optional(),
});

const actionSchema = z.strictObject({
  t: tokenSchema,
  doi: doiSchema,
  action: landingActionSchema,
});

export interface LandingApiDeps {
  readonly pages: LandingPages;
  readonly referrals: Referrals;
  readonly limiter: RateLimiter;
  /** When set, every request must carry it as a bearer token. */
  readonly secret?: string;
  readonly metrics: ServerMetrics;
}

/** The landing API's routes, below the HTTP handler's Host check. */
export interface LandingApi {
  fetch(request: Request, path: string): Promise<Response>;
}

/**
 * The token resolver API the landing page calls from its server (ADR 0032).
 * `GET /landing/v1/page?t=<token>&doi=<doi>` returns the page. `POST /landing/v1/visits`
 * with `{ t, doi, tool }` records a visit the browser confirmed, and `POST
 * /landing/v1/actions` with `{ t, doi, action }` an access button click (ADR 0033). Reading
 * a page never counts or consumes anything, so link previews cannot use a token up. Every
 * route takes the shared secret and a token bucket per visitor; none ever sees query text.
 */
export function createLandingApi(deps: LandingApiDeps): LandingApi {
  const { pages, referrals, metrics } = deps;
  const secret = deps.secret === undefined ? undefined : digest(deps.secret);

  const authorised = (request: Request) => {
    if (secret === undefined) return true;
    const header = request.headers.get('authorization') ?? '';
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value !== undefined
      ? timingSafeEqual(digest(value), secret)
      : false;
  };

  const page = async (request: Request): Promise<Response> => {
    const params = new URL(request.url).searchParams;
    // A malformed token is treated like an unknown one, so the page still falls back.
    const token = tokenSchema.safeParse(params.get('t') ?? undefined);
    const rawDoi = params.get('doi');
    const doi = rawDoi === null ? undefined : doiSchema.safeParse(rawDoi);
    if (doi?.success === false) return json(400, { error: 'invalid_doi' });
    const hasToken = params.has('t');
    const result = await pages.resolve(
      {
        ...(token.success && { token: token.data }),
        ...(doi?.success === true && { doi: doi.data }),
      },
      request.signal,
    );
    if (result === undefined) {
      metrics.landingPages.inc({ session: 'not_found' });
      return json(404, { error: 'not_found' });
    }
    // A token of the wrong shape never reaches the store, but it was still a token link.
    const session = result.session === 'none' && hasToken ? 'unavailable' : result.session;
    metrics.landingPages.inc({ session });
    return json(200, landingPageSchema.parse({ ...result, session }));
  };

  const visit = async (request: Request): Promise<Response> => {
    const body = visitSchema.safeParse(await request.json().catch(() => undefined));
    if (!body.success) return json(400, { error: 'invalid_visit' });
    const { t: token, doi } = body.data;
    const event = await referrals.record({ kind: 'landing_visit', token, doi }, request.signal);
    if (event !== undefined) {
      const campaign = toolNameSchema.safeParse(body.data.tool);
      const tool = event.tool ?? (campaign.success ? campaign.data : 'unknown');
      metrics.landingVisits.inc({ tool });
    }
    return accepted();
  };

  const action = async (request: Request): Promise<Response> => {
    const body = actionSchema.safeParse(await request.json().catch(() => undefined));
    if (!body.success) return json(400, { error: 'invalid_action' });
    const { t: token, doi, action: clicked } = body.data;
    const referral = { kind: 'landing_action', token, doi, action: clicked } as const;
    if ((await referrals.record(referral, request.signal)) !== undefined) {
      metrics.landingActions.inc({ action: clicked });
    }
    return accepted();
  };

  const routes: Record<string, { method: string; handle: typeof page } | undefined> = {
    [LANDING_PAGE_PATH]: { method: 'GET', handle: page },
    [LANDING_VISITS_PATH]: { method: 'POST', handle: visit },
    [LANDING_ACTIONS_PATH]: { method: 'POST', handle: action },
  };

  return {
    fetch: async (request, path) => {
      const route = routes[path];
      if (route === undefined) return json(404, { error: 'not_found' });
      if (
        request.method !== route.method &&
        !(route.method === 'GET' && request.method === 'HEAD')
      ) {
        return json(405, { error: 'method_not_allowed' }, { allow: route.method });
      }
      if (!authorised(request)) return json(401, { error: 'unauthorized' });
      const visitor = (request.headers.get(VISITOR_HEADER) ?? 'anonymous').slice(
        0,
        VISITOR_MAX_LENGTH,
      );
      try {
        deps.limiter.take(`landing:${visitor}`);
      } catch (error) {
        const retryAfter = isAppError(error) ? error.retryAfterSeconds : undefined;
        return json(
          429,
          { error: 'rate_limited' },
          retryAfter === undefined ? {} : { 'retry-after': String(retryAfter) },
        );
      }
      return route.handle(request);
    },
  };
}

/** The same answer for live and unknown tokens: a referral says nothing about the token. */
function accepted(): Response {
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...headers },
  });
}
