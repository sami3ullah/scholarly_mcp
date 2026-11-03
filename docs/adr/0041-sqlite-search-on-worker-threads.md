# 0041 SQLite search on worker threads

- Status: accepted
- Date: 2026-11-03
- Records: SM-17; builds on ADR 0022 (SQLite index files), ADR 0040 (vector scan by Euclidean distance)

## Context

After ADR 0040 one search costs about 50 ms natively and about 100 ms in the Linux image (the scan there is 65 ms against 29 ms on macOS: the Linux build of sqlite-vec computes L2 at about a third of the scalar cosine time, which fits a scalar build, while the macOS one uses NEON). better-sqlite3 runs every query synchronously on the event loop, so one server serves about 13 tool calls a second whatever its CPUs: 12.5 on 2 vCPUs, 13.0 with no limit. The plan asks for 20 a second on a 2-vCPU container.

The ticket's options, measured on the full index (70,989 articles, 176,536 chunks):

- **Worker threads, each with its own read-only connection.** Natively, 120 searches (lexical and vector) with 8 in flight ran at 29.5 a second on the event loop, 28.7 on one worker, 58.1 on two and 114.3 on four. Exact results, no index change.
- **An approximate or quantised vector index.** Changes results, needs a new index layout and a re-tuned golden set; not needed at this corpus size (ADR 0040).
- **Cheaper lexical stages.** The main FTS5 query is 14 ms on average (64 ms at most); trimming it saves less than a worker does.

## Decision

1. **Lexical and vector searches run on a pool of worker threads.** `openIndexReader(path, model, signal, { searchWorkers })` starts the pool once the file has passed its checks; each worker opens the index read-only (memory-mapped, so the workers share the page cache) on its first request. A search waits in one FIFO queue for the next idle worker; one aborted while it waits is dropped and rejects with the abort reason; one already running finishes, as a SQLite query cannot be interrupted. A worker that crashes fails the call it was running and is replaced. Article and chunk lookups (under 1 ms) stay on the main thread's connection.
2. **Index swaps move the workers first.** `refresh()` checks the new file on the main thread, has every worker reopen it (a worker opens the new file before closing the old, so a failure leaves it where it was), then swaps the main connection. A failure is `INDEX_UNAVAILABLE` and the main thread stays on the current index; the next refresh tick tries again. In the short window between the two, a search may name a chunk the lookups do not find yet, which the search service already handles as an index that changed mid-request.
3. **`SQLITE_SEARCH_WORKERS`, default 2.** About one per CPU the server may use; the image targets 2 vCPUs. 0 keeps searches on the event loop, which the eval and ingest tools use.

## Consequences

- At 20 tool calls a second offered on 2 vCPUs, the full index serves 19.4 a second at p50 344 ms, p95 517 ms, p99 900 ms, with 1 `TIMEOUT` in 1,167 calls (3 workers: 19.8 a second, p95 525 ms). Before SM-17 it served 4.4 a second at p95 3,527 ms. The CPUs are now the limit: one worker serves 12.8 a second, and a cap of 1 or 2 ONNX threads did not change the result.
- The p95 is at the plan's 500 ms line, not clearly under it. The next lever is the scan in the Linux image: a sqlite-vec built with NEON (arm64) or AVX (amd64). [ADR 0042](0042-sqlite-vec-compiled-with-simd-in-the-image.md) compiles it in the image, which brings the scan from 65 to 33 ms and p95 at 20 calls a second on 2 vCPUs to about 350 ms.
- Two workers add about 85 MiB (659 MiB when ready, against 573 MiB without them); the mapped index pages are shared. Memory after a load run: about 1.4 GiB, mostly file cache (ADR 0040).
- The worker entry is compiled JavaScript under `dist/`; tests of the pool need the package built, which `pnpm test` does first.
- Retrieval is unchanged: the workers run the same queries as before.
