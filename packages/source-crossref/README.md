# @scholarly-mcp/source-crossref

The Crossref adapter for the `Source` port: walks a DOI prefix with deep-paging cursors and emits canonical journal articles with cleaned abstracts, licences and retraction flags. Design rules: [ADR 0020](../../docs/adr/0020-crossref-source-ingestion-rules.md).

## Configuration

| Variable                 | Default                    | Meaning                                                                                               |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `CROSSREF_PREFIX`        | required                   | DOI prefix to ingest, e.g. `10.1055` ([Thieme preset](../../presets/thieme.env))                      |
| `CROSSREF_FROM_PUB_DATE` | unset (all years)          | Only articles published on or after this date (`YYYY-MM-DD`)                                          |
| `CROSSREF_MAILTO`        | unset (public pool)        | Contact email; joins Crossref's polite pool ([ADR 0005](../../docs/adr/0005-crossref-public-pool.md)) |
| `CROSSREF_API_URL`       | `https://api.crossref.org` | API base URL                                                                                          |
| `CROSSREF_ROWS`          | `100`                      | Records per page (1-1000)                                                                             |
| `CROSSREF_TIMEOUT_MS`    | `30000`                    | Timeout per request attempt                                                                           |
| `CROSSREF_MAX_RETRIES`   | `6`                        | Retries for 429, 5xx, timeouts and network errors                                                     |

## Usage

```ts
const source = createCrossrefSource({
  config: parseConfig(crossrefConfigSchema, process.env),
  clock,
  logger,
});
const page = await source.fetchPage({ updatedSince }, signal); // then pass page.nextCursor
```

## Tests and fixtures

`fixtures/` holds real Crossref responses (reference lists removed). Re-record them with `node scripts/record-fixtures.mjs` from this folder; it makes a handful of requests at one per second.
