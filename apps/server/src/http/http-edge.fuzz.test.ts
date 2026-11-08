import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { createTestLogger } from '@scholarly-mcp/testkit';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClientContext } from '../limits/client-limit-key.js';
import { createMetrics } from '../telemetry/create-metrics.js';
import { FULL_TEXT_MARKER, startHarness, textOf, type Harness } from '../testing/server-harness.js';
import { createHttpHandler, type HttpHandler } from './create-http-handler.js';

/**
 * Fuzzing the HTTP edge and the tool inputs: whatever a client sends, the server
 * answers with a 4xx or a well-formed result, never a 5xx, a thrown error or full text.
 */
const LOCAL = ['localhost', '127.0.0.1'];
const RUNS = { numRuns: 200 };

let harness: Harness;
let edge: HttpHandler;
beforeAll(async () => {
  harness = await startHarness({
    http: {
      wrap: (mcp: McpHttpHandler) => {
        edge = createHttpHandler({
          mcp,
          clientContext: createClientContext(),
          allowedHosts: LOCAL,
          allowedOrigins: LOCAL,
          readiness: () => ({ index: true, model: true }),
          metrics: createMetrics({ defaults: false }),
          logger: createTestLogger(),
          exposeMetrics: false,
        });
        return edge;
      },
    },
  });
});
afterAll(async () => {
  await harness.close();
});

const json = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

const path = fc.oneof(
  fc.constantFrom('/mcp', '/healthz', '/readyz', '/metrics', '/landing/v1/articles/x', '/'),
  fc.webPath(),
);
const headerValue = fc.string({ maxLength: 80 }).map((value) => value.replace(/[^\x20-\x7e]/g, ''));
const headers = fc.dictionary(
  fc.constantFrom('authorization', 'host', 'origin', 'content-type', 'accept', 'x-forwarded-for'),
  headerValue,
);
const body = fc.oneof(
  fc.string({ maxLength: 500 }),
  fc.jsonValue({ maxDepth: 4 }).map((value) => JSON.stringify(value)),
);

/** A JSON-RPC message with arbitrary method, id and params. */
const rpc = fc.record(
  {
    jsonrpc: fc.oneof(fc.constant('2.0'), fc.string({ maxLength: 5 })),
    id: fc.oneof(fc.integer(), fc.string({ maxLength: 10 }), fc.constant(null)),
    method: fc.oneof(
      fc.constantFrom('initialize', 'tools/list', 'tools/call', 'ping', 'resources/list'),
      fc.string({ maxLength: 30 }),
    ),
    params: fc.jsonValue({ maxDepth: 3 }),
  },
  { requiredKeys: [] },
);

const TOOLS = [
  'search_articles',
  'get_article',
  'find_related',
  'get_journal',
  'cite',
  'check_access',
];
const KEYS = [
  'query',
  'doi',
  'issn',
  'journal',
  'language',
  'limit',
  'style',
  'cursor',
  'yearFrom',
];
/** Arguments with the tools' own keys as well as random ones, of any JSON type. */
const args = fc.dictionary(
  fc.oneof(fc.constantFrom(...KEYS), fc.string({ maxLength: 10 })),
  fc.oneof(
    fc.string({ maxLength: 300 }),
    fc.constantFrom('10.1055/a-1001', 'doi:10.1055/A-1001', '0340-6245', 'apa', 'de'),
    fc.integer(),
    fc.double(),
    fc.boolean(),
    fc.jsonValue({ maxDepth: 2 }),
  ),
  { maxKeys: 4 },
);

describe('the HTTP edge under fuzzing', () => {
  it('answers any method, path, headers and body without a server error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'),
        path,
        headers,
        body,
        async (method, target, extra, payload) => {
          const response = await edge.fetch(
            new Request(`http://localhost${target}`, {
              method,
              headers: extra,
              ...(method !== 'GET' && method !== 'HEAD' && { body: payload }),
            }),
          );
          expect(response.status).toBeLessThan(500);
        },
      ),
      RUNS,
    );
  });

  it('answers any JSON-RPC message from a valid key without a server error', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(rpc, fc.array(rpc, { maxLength: 3 })), async (message) => {
        const response = await edge.fetch(
          new Request('http://localhost/mcp', {
            method: 'POST',
            headers: json,
            body: JSON.stringify(message),
          }),
        );
        expect(response.status).toBeLessThan(500);
        const text = await response.text();
        expect(text).not.toContain(FULL_TEXT_MARKER);
      }),
      RUNS,
    );
  });
});

describe('the tools under fuzzing', () => {
  it('answer any arguments with a result or a tool error, never an internal error', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...TOOLS), args, async (name, input) => {
        const result = await harness.call(name, input);
        const text = textOf(result);
        expect(text.length).toBeGreaterThan(0);
        expect(JSON.stringify(result)).not.toContain(FULL_TEXT_MARKER);
        if (result.isError === true) expect(text).not.toMatch(/internal|stack|at \w+ \(/i);
        else expect(result.structuredContent).toBeDefined();
      }),
      RUNS,
    );
  });
});
