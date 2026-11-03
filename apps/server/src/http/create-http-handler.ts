import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  bearerAuthChallengeResponse,
  OAuthError,
  originValidationResponse,
  validateHostHeader,
  verifyBearerToken,
  type AuthInfo,
  type McpHandlerRequestOptions,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/server';
import type { Logger } from '@scholarly-mcp/core';
import {
  LANDING_PAGE_PATH,
  LANDING_VISITS_PATH,
  type LandingApi,
} from '../landing/create-landing-api.js';
import type { ServerMetrics } from '../telemetry/create-metrics.js';

/** The MCP endpoint's path. */
export const MCP_PATH = '/mcp';

/** Longest request URL accepted; MCP puts nothing in the query string (PLAN.md limits). */
export const MAX_URL_LENGTH = 2048;

/** How requests to `/mcp` are authenticated. */
export type HttpAuth =
  | { readonly mode: 'none' }
  | {
      readonly mode: 'bearer';
      readonly verifier: OAuthTokenVerifier;
      readonly requiredScopes?: readonly string[];
      /** Audience the token must be issued for (OAuth mode). */
      readonly expectedResource?: URL;
      /** RFC 9728 Protected Resource Metadata, served and advertised in challenges. */
      readonly protectedResource?: {
        readonly url: URL;
        readonly document: Readonly<Record<string, unknown>>;
      };
    };

/** What `/readyz` reports; ready only when every check is true. */
export type Readiness = () => Readonly<Record<string, boolean>>;

/** Where the landing API's routes start. */
const LANDING_PREFIX = '/landing/v1/';

export interface HttpHandlerDeps {
  /** The MCP endpoint; absent when MCP runs on stdio and HTTP serves the rest alone. */
  readonly mcp?: { fetch(request: Request, options?: McpHandlerRequestOptions): Promise<Response> };
  /** The landing API the landing page calls from its server (ADR 0032). */
  readonly landing?: LandingApi;
  readonly auth: HttpAuth;
  /** Hostnames the `Host` header may name on `/mcp` and the landing API. */
  readonly allowedHosts: readonly string[];
  /** Hostnames a browser `Origin` may have on `/mcp`; requests without `Origin` pass. */
  readonly allowedOrigins: readonly string[];
  readonly readiness: Readiness;
  readonly metrics: ServerMetrics;
  readonly logger: Logger;
}

/** A web-standard handler for every HTTP route of the server. */
export interface HttpHandler {
  fetch(request: Request): Promise<Response>;
}

const tracer = trace.getTracer('scholarly-mcp');

/**
 * Routes the HTTP transport (ADR 0031): `/healthz` (the process answers), `/readyz` (index
 * and model loaded, not draining), `/metrics` (Prometheus), the OAuth Protected Resource
 * Metadata, `/mcp`, and the landing API below `/landing/v1/` (ADR 0032). Only `/mcp` and
 * the landing API check `Host` (DNS rebinding) against the allowlist, since probes and
 * scrapers reach the pod by address and get no data. `/mcp` also checks `Origin` and
 * authenticates; the landing API checks its own secret. No route sends CORS headers, so
 * browsers on other sites cannot read any answer.
 */
export function createHttpHandler(deps: HttpHandlerDeps): HttpHandler {
  const { auth, metrics } = deps;
  const prmPath = auth.mode === 'bearer' ? auth.protectedResource?.url.pathname : undefined;

  const route = async (request: Request, path: string): Promise<Response> => {
    if (request.url.length > MAX_URL_LENGTH) return plain(414, 'URI too long');
    if (path === MCP_PATH && deps.mcp !== undefined) return mcp(request, deps.mcp);
    if (path.startsWith(LANDING_PREFIX) && deps.landing !== undefined) {
      return hostAllowed(request)
        ? deps.landing.fetch(request, path)
        : json(403, { error: 'forbidden', message: 'Host not allowed' });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return path === '/healthz' || path === '/readyz' || path === '/metrics' || path === prmPath
        ? plain(405, 'Method not allowed', { allow: 'GET, HEAD' })
        : plain(404, 'Not found');
    }
    if (path === '/healthz') return json(200, { status: 'ok' });
    if (path === '/readyz') {
      const checks = deps.readiness();
      const ready = Object.values(checks).every(Boolean);
      return json(ready ? 200 : 503, { status: ready ? 'ready' : 'not ready', checks });
    }
    if (path === '/metrics') {
      return new Response(await metrics.registry.metrics(), {
        headers: { 'content-type': metrics.registry.contentType, 'cache-control': 'no-store' },
      });
    }
    if (path === prmPath && auth.mode === 'bearer' && auth.protectedResource !== undefined) {
      return json(200, auth.protectedResource.document);
    }
    return plain(404, 'Not found');
  };

  // Web requests drop the `Host` header; the Node adapter puts it in the URL instead.
  const hostAllowed = (request: Request) =>
    validateHostHeader(new URL(request.url).host, [...deps.allowedHosts]).ok;

  const mcp = async (
    request: Request,
    endpoint: NonNullable<HttpHandlerDeps['mcp']>,
  ): Promise<Response> => {
    if (!hostAllowed(request))
      return json(403, { error: 'forbidden', message: 'Host not allowed' });
    const refused = originValidationResponse(request, [...deps.allowedOrigins]);
    if (refused !== undefined) return refused;
    let authInfo: AuthInfo | undefined;
    if (auth.mode === 'bearer') {
      const options = {
        verifier: auth.verifier,
        ...(auth.requiredScopes !== undefined && { requiredScopes: [...auth.requiredScopes] }),
        ...(auth.expectedResource !== undefined && { expectedResource: auth.expectedResource }),
        ...(auth.protectedResource !== undefined && {
          resourceMetadataUrl: auth.protectedResource.url.href,
        }),
      };
      try {
        authInfo = await verifyBearerToken(request.headers.get('authorization'), options);
      } catch (error) {
        metrics.authFailures.inc({ reason: error instanceof OAuthError ? error.code : 'error' });
        return bearerAuthChallengeResponse(error, options);
      }
    }
    return endpoint.fetch(request, authInfo === undefined ? {} : { authInfo });
  };

  return {
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const label = routeLabel(path, prmPath);
      const span = tracer.startSpan(`${request.method} ${label}`, {
        kind: SpanKind.SERVER,
        attributes: { 'http.request.method': request.method, 'http.route': label },
      });
      try {
        const response = await context.with(trace.setSpan(context.active(), span), () =>
          route(request, path),
        );
        span.setAttribute('http.response.status_code', response.status);
        if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
        metrics.httpRequests.inc({ route: label, status: String(response.status) });
        return response;
      } catch (error) {
        deps.logger.error({ err: error, route: label }, 'HTTP request failed');
        span.setStatus({ code: SpanStatusCode.ERROR });
        metrics.httpRequests.inc({ route: label, status: '500' });
        return plain(500, 'Internal error');
      } finally {
        span.end();
      }
    },
  };
}

/** A fixed route name for metrics and spans, so unknown paths cannot grow label sets. */
function routeLabel(path: string, prmPath: string | undefined): string {
  if (
    path === MCP_PATH ||
    path === '/healthz' ||
    path === '/readyz' ||
    path === '/metrics' ||
    path === LANDING_PAGE_PATH ||
    path === LANDING_VISITS_PATH
  ) {
    return path;
  }
  return path === prmPath ? '/.well-known/oauth-protected-resource' : 'other';
}

function plain(status: number, text: string, headers: Record<string, string> = {}): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain', ...headers } });
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
