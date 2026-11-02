# @scholarly-mcp/eval

Measures search with the real embedder and search service, wired the way the server wires them: latency on the live index, and relevance on the golden set (SM-08, [ADR 0026](../../docs/adr/0026-golden-set-eval-and-tuning.md)).

| Command       | What it does                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `eval bench`  | Runs 45 synthetic queries (German, English, mixed, abbreviations, edge cases, filters, DOIs) and times each search |
| `eval golden` | Scores the 60 golden queries: recall@10, MRR and nDCG@10, overall and per group (de, en, cross)                    |

The embedding cache is off, so every search pays for its embedding. Reports go to stdout as JSON; logs go to stderr.

`bench` options: `--rounds N` (default 5), `--max-p95 MS` (default 500), `--show` to print each query's top 3 results with their match labels. Exit codes: `0` p95 within the limit and no failures, `1` over it or a search failed, `2` bad usage.

`golden` options: `--golden FILE` (default `packages/testkit/golden/golden-set.json`), `--show` to print each query's scores and the grades of its top ten (`2`, `1`, `.`), worst first, `--baseline FILE` to fail on any drop against a committed baseline, `--write-baseline FILE` to record the current scores, `--rankings FILE` to write each query's top ten DOIs (to pool a new model's results for judging), `--min-recall R` and `--min-cross-recall R` (defaults 0.8 and 0.7, the SM-08 targets, used when there is no `--baseline`). Exit codes: `0` passed, `1` a score dropped or is below target, `2` bad usage or a baseline from another index or golden set version.

```bash
LOG_LEVEL=warn EMBEDDER_CACHE_DIR=.cache/models pnpm eval bench --show
LOG_LEVEL=warn EMBEDDER_CACHE_DIR=.cache/models pnpm eval golden --show
```

See [Evaluating search](../../docs/guides/evaluating-search.md) for the regression gate on the eval index.

## Configuration

Everything from the [embedder](../../packages/embedder-onnx/README.md), the [SQLite store](../../packages/store-sqlite/README.md) (`INDEX_PATH`) and the [search service](../../packages/search/README.md), plus `LOG_LEVEL`.
