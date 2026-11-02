import type { FulltextConfig } from '@scholarly-mcp/core';
import { DEFAULT_FULLTEXT_LICENSES } from '@scholarly-mcp/core';
import { createFakeClock, createTestLogger, type CapturedLine } from '@scholarly-mcp/testkit';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { EuropepmcConfig } from '../config/europepmc-config.js';
import { createEuropepmcEnricher } from '../create-europepmc-enricher.js';
import { NOW, endoscopyXml, searchBody } from './europepmc-fixtures.js';

export const API = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
export const SEARCH = `${API}/search`;
export const FULL_TEXT = `${API}/:pmcid/fullTextXML`;

/** Test config: no request gap, a short timeout and few retries. */
export const testConfig: EuropepmcConfig = {
  EUROPEPMC_API_URL: API,
  EUROPEPMC_BATCH_SIZE: 100,
  EUROPEPMC_REQUEST_GAP_MS: 0,
  EUROPEPMC_TIMEOUT_MS: 50,
  EUROPEPMC_MAX_RETRIES: 2,
};

const fulltext: FulltextConfig = { FULLTEXT_LICENSE_ALLOWLIST: [...DEFAULT_FULLTEXT_LICENSES] };

/** Answers searches with the recorded hits whose DOI the query names, as Europe PMC would. */
export const recordedSearch = http.get(SEARCH, ({ request }) => {
  const query = new URL(request.url).searchParams.get('query') ?? '';
  const result = searchBody.resultList.result.filter((hit) => {
    const doi = hit['doi'];
    // The DOI-less record matched the query for 10.1055/s-0042-1751569 when recorded.
    return typeof doi === 'string' ? query.includes(`"${doi}"`) : query.includes('s-0042-1751569');
  });
  return HttpResponse.json({ ...searchBody, hitCount: result.length, resultList: { result } });
});

/** Serves the recorded CC BY full text; any other PMCID answers as Europe PMC does, with a 500. */
export const recordedFullText = http.get(FULL_TEXT, ({ params }) =>
  params['pmcid'] === 'PMC11288659'
    ? HttpResponse.xml(endoscopyXml)
    : HttpResponse.json({ status: 500, error: 'Internal Server Error' }, { status: 500 }),
);

/** Starts an msw server with the recorded handlers and records every request URL. */
export function useEuropepmcServer() {
  const server = setupServer(recordedSearch, recordedFullText);
  const requests: URL[] = [];
  server.events.on('request:start', ({ request }) => requests.push(new URL(request.url)));
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    requests.length = 0;
  });
  afterAll(() => {
    server.close();
  });
  return { server, requests };
}

/** An enricher with a fake clock, instant recorded sleeps, fixed jitter and a capturing logger. */
export function createTestEnricher(overrides: Partial<EuropepmcConfig> = {}) {
  const clock = createFakeClock(NOW);
  const sleeps: number[] = [];
  const lines: CapturedLine[] = [];
  const enricher = createEuropepmcEnricher({
    config: { ...testConfig, ...overrides },
    fulltext,
    clock,
    logger: createTestLogger(lines),
    random: () => 0.5,
    sleep: (ms, signal) => {
      signal.throwIfAborted();
      sleeps.push(ms);
      clock.advance(ms);
      return Promise.resolve();
    },
  });
  return { enricher, sleeps, lines };
}
