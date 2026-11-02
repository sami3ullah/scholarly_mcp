# @scholarly-mcp/source-europepmc

The Europe PMC adapter for the `ArticleEnricher` port. It adds two things to articles Crossref emitted, matched on DOI only:

- **Subjects:** MeSH descriptor names (without check tags such as "Humans") and author keywords, each tagged with its origin ([ADR 0004](../../docs/adr/0004-subjects-from-europe-pmc.md)).
- **Open access full text, for matching only:** sections of the JATS body with generic labels (Introduction, Methods, Results, Discussion, Conclusion, Case report) and no headings. It is never shown to a reader or a model ([ADR 0003](../../docs/adr/0003-cc-by-nc-nd-full-text-for-matching-only.md)).

All the rules are in [ADR 0024](../../docs/adr/0024-europe-pmc-enrichment.md). In short, full text is used only when all of these hold:

- the article's version-of-record licence is in force and on `FULLTEXT_LICENSE_ALLOWLIST`
- the article is not retracted
- Europe PMC holds an open access copy under a PMCID, and that copy is not an author manuscript or preprint
- Europe PMC's licence family matches Crossref's
- the JATS states the same DOI
- the JATS carries no text and data mining reservation

## Configuration

| Variable                     | Default                                            | Meaning                                                    |
| ---------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `EUROPEPMC_API_URL`          | `https://www.ebi.ac.uk/europepmc/webservices/rest` | API base URL                                               |
| `EUROPEPMC_BATCH_SIZE`       | `100`                                              | DOIs per search request (1-200)                            |
| `EUROPEPMC_REQUEST_GAP_MS`   | `200`                                              | Least time between requests; Europe PMC publishes no limit |
| `EUROPEPMC_TIMEOUT_MS`       | `30000`                                            | Timeout per request attempt                                |
| `EUROPEPMC_MAX_RETRIES`      | `3`                                                | Retries for 429, 5xx, timeouts and network errors          |
| `FULLTEXT_LICENSE_ALLOWLIST` | CC BY 4.0, CC BY-NC-ND 4.0                         | Licences whose full text may be indexed (core, ADR 0003)   |

Ingestion turns the adapter on with `EUROPEPMC_ENABLED=true` ([ingest](../../apps/ingest/README.md)).

## Usage

```ts
const enricher = createEuropepmcEnricher({
  config: parseConfig(europepmcConfigSchema, process.env),
  fulltext: parseConfig(fulltextConfigSchema, process.env),
  clock,
  logger,
});
const found = await enricher.lookup(page.articles, signal); // Map<Doi, Enrichment>
const ref = found.get(doi)?.fullText;
const sections = ref && (await enricher.fetchFullText(doi, ref, signal));
```

## Tests and fixtures

`fixtures/search.json` is a real `core` search for seven Thieme DOIs, cut down to the fields the adapter reads (no abstracts or author lists). `fixtures/fulltext/` holds full texts verbatim, and only CC BY ones, which may be redistributed with the attribution each file carries. CC BY-NC-ND texts are not committed; tests cover those cases with small synthetic JATS. Re-record with `node scripts/record-fixtures.mjs` from this folder.
