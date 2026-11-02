# @scholarly-mcp/http

The retrying GET client the source adapters share (Crossref, Europe PMC). One request at a time per client.

- Spaces requests by a fixed `minGapMs`, or by the gap an API advertises (`gapFromHeaders`, e.g. Crossref's `x-rate-limit-*` headers via `minRequestGapMs`).
- Times out each attempt and retries 429s, 5xx responses, timeouts, network errors and bodies the reader cannot read, with exponential backoff and full jitter (1 s base, 60 s cap), waiting at least `Retry-After`.
- Never retries the caller's abort or other 4xx answers; those come back with their status for the adapter to judge.
- When retries run out it throws `RATE_LIMITED` (with `retryAfterSeconds`) after 429s, else `SOURCE_UNAVAILABLE`. A `Retry-After` beyond the cap fails fast.

Rules and their origin: [ADR 0020](../../docs/adr/0020-crossref-source-ingestion-rules.md) (Crossref), [ADR 0024](../../docs/adr/0024-europe-pmc-enrichment.md) (Europe PMC).

```ts
const http = createHttpClient({
  name: 'Europe PMC',
  accept: 'application/json, application/xml',
  minGapMs: 200,
  fetch,
  clock,
  sleep,
  random,
  logger,
  userAgent,
  timeoutMs: 30_000,
  maxRetries: 3,
});
const { status, body } = await http.get(url, (text) => JSON.parse(text) as unknown, signal);
```
