# @scholarly-mcp/search

The search service (ARCHITECTURE.md "Query pipeline"): validates the query, looks a DOI up directly, otherwise runs lexical and vector retrieval in parallel with the same filters, fuses them with Reciprocal Rank Fusion (k = 60), collapses chunks to one result per article and returns a page with teasers, match labels and a cursor, all within a 2 s budget. It depends only on core and zod; adapters are passed in. Design rules: [ADR 0023](../../docs/adr/0023-search-service-rules.md).

## Configuration

| Variable            | Default | Meaning                                                                 |
| ------------------- | ------- | ----------------------------------------------------------------------- |
| `SEARCH_BUDGET_MS`  | `2000`  | Time budget per search; over it the search fails with `TIMEOUT`         |
| `SEARCH_CANDIDATES` | `50`    | Chunks fetched from each side (lexical and vector) before fusion        |
| `SEARCH_CACHE_SIZE` | `1000`  | Query embeddings kept in the LRU cache, keyed by hash; `0` turns it off |

## Usage

```ts
const search = createSearchService({
  reader: index.reader,
  search: index.search,
  embedder,
  clock,
  logger,
  options: searchOptionsFrom(parseConfig(searchConfigSchema, process.env)),
});

const page = await search.search(
  { query: 'Vorhofflimmern im Alter', filters: { yearFrom: 2024 }, limit: 5 },
  signal,
);
// page.hits: { article, matchedChunkId, teaser, whyMatched }[]
// page.nextCursor: pass back as `cursor` for the next page

const related = await search.related({ doi, limit: 5 }, signal);
// related.article, related.hits: nearest articles to the mean of its chunk vectors
```

`related` runs vector search only, leaves out retracted articles and the article itself, and fails with `NOT_FOUND` for an unknown DOI ([ADR 0025](../../docs/adr/0025-mcp-server-and-tool-rules.md)). Filter by journal with `journalIssns`, all of a journal's ISSNs.

The tool layer turns each hit into an article card (landing link, access status) and shows only the teaser and `whyMatched` from the article's text.

## Errors

| Code                | When                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `INVALID_INPUT`     | No letter or digit in the query, `limit` outside 1-10, `yearFrom` after `yearTo`, a forged cursor |
| `CURSOR_STALE`      | The index was swapped since the first page                                                        |
| `TIMEOUT`           | The search ran over its budget                                                                    |
| `INDEX_UNAVAILABLE` | No index has been built yet                                                                       |
| `NOT_FOUND`         | `related` for a DOI that is not indexed                                                           |

No results is an empty page, not an error.
