# @scholarly-mcp/eval

Measures search on the live index with the real embedder and search service, wired the way the server will wire them. SM-08 adds the golden-set evaluation here.

| Command      | What it does                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `eval bench` | Runs 45 synthetic queries (German, English, mixed, abbreviations, edge cases, filters, DOIs) and times each search |

Options: `--rounds N` (default 5), `--max-p95 MS` (default 500), `--show` to print each query's top 3 results with their match labels. The embedding cache is off, so every search pays for its embedding.

The report goes to stdout as JSON (latency p50, p95, max and mean overall and per group, empty results, failures); logs go to stderr. Exit codes: `0` p95 within the limit and no failures, `1` over it or a search failed, `2` bad usage.

```bash
LOG_LEVEL=warn EMBEDDER_CACHE_DIR=.cache/models pnpm eval bench --show
```

## Configuration

Everything from the [embedder](../../packages/embedder-onnx/README.md), the [SQLite store](../../packages/store-sqlite/README.md) (`INDEX_PATH`) and the [search service](../../packages/search/README.md), plus `LOG_LEVEL`.
