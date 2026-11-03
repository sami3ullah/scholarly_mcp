# 0040 SQLite vector scan by Euclidean distance, on a mapped file

- Status: accepted
- Date: 2026-11-03
- Records: SM-17; amends ADR 0022 decision 8 (exact cosine scan of a plain table)

## Context

The SM-14 load test found one SQLite server serving about 4.4 tool calls a second on the full index (70,989 articles, 176,536 chunks), with 13 of 266 calls timing out at 20 calls a second offered (`TIMEOUT`, the 2 s search budget; 2 vCPUs, 2026-11-03). Each search ran about 200 ms of synchronous work on the event loop.

Profile of one search on the full index, by stage (12 load-test queries, 3 rounds after a warm-up, Apple M4 Max, native Node 24, cache off):

| Stage                                 | Before, ms | After, ms |
| ------------------------------------- | ---------: | --------: |
| Query embedding (ONNX thread pool)    |        2.3 |       2.1 |
| Lexical, main FTS5 table              |       20.5 |      13.9 |
| Lexical, trigram top-up (3 of 36)     |        0.4 |       0.3 |
| Vector scan                           |      174.3 |      31.1 |
| Article and chunk hydration           |        0.6 |       0.6 |
| **Search total** (with fusion, cards) |  **200.4** |  **50.5** |

The vector scan was 87% of a search. Taking it apart on the same file:

- Reading every row (`sum(length(embedding))`) took 59 ms: SQLite copied each page out of the OS cache. With `mmap_size` set it took 12 ms.
- `vec_distance_cosine` is scalar in sqlite-vec 0.1.9; `vec_distance_l2` uses SIMD. Top 50 by cosine took 117 ms on a mapped file, by L2 30 ms.
- The `distance < 1` cut-off in the scan's `WHERE` made SQLite evaluate the distance twice per row (the alias is inlined): 51 ms against 30 ms without it.
- Every stored vector has unit length (norms 0.9999993 to 1.0000007 on the full index): the embedder normalises both passages and queries. For unit vectors ‖a − b‖² = 2 − 2 cos(a, b), so L2 order is cosine order and cosine above 0 is L2 below √2. On 200 random chunk vectors as queries, the L2 and cosine top 50 held the same chunks every time; 2 queries swapped one pair of neighbours whose distances differ in the seventh digit.

Inside the server image (linux arm64, 2 vCPUs) the same L2 scan takes 65 ms against 29 ms natively; the cosine scan takes 170 ms in both, so the Linux build of sqlite-vec gains less from SIMD.

## Decision

1. **Rank by `vec_distance_l2`.** The SQLite vector scan orders by Euclidean distance and keeps the top k, then drops rows at or beyond √2 − 1e-6 (cosine 0 or below, with room for float32 rounding) outside the scan. Dropping after the cut keeps the same rows, since the nearest k past the cut-off are all past it.
2. **Unit length is a checked invariant.** `chunkSchema` refuses an embedding whose length strays from 1 by more than 1e-3, so a store can rely on it; `VectorQuery` documents the same for queries (the embedder and the related-article mean vector both normalise). The test chunk builder scales its vectors to unit length. The verify check that a sample is found by its own vector is now tested on `sampleQueryChecks` with fakes, since a zero vector can no longer be stored to make it fail.
3. **Map read-only files into memory.** `openDatabase` sets `mmap_size` to SQLite's ceiling (2 GiB) on read-only connections. Index files are only ever replaced by a rename (ADR 0022), never changed in place, so a mapping cannot see a truncated file.

## Consequences

- One search drops from about 200 ms to about 50 ms natively. In the 2-vCPU container at 20 calls a second offered, the server serves 12.5 a second (p50 786, p95 1,103 ms; 5 `TIMEOUT`s) instead of 4.4. Without a CPU limit it serves 13 a second: the single event loop is now the ceiling, not the CPUs. Reaching 20 a second needs the search off the event loop (ADR 0041).
- Retrieval is unchanged: the golden set on the eval index scores exactly the committed baseline (recall@10 0.68, MRR 0.888, nDCG@10 0.627, every group equal).
- Mapped pages count towards the container's memory as file cache: after a load run it reports about 1.3 GiB against 640 MiB before. The kernel can drop those pages under pressure, but a memory limit near 1 GiB would reclaim them constantly; [OPERATIONS.md](../OPERATIONS.md#capacity) gives the new sizing.
- The index layout is unchanged; existing index files work as they are.
- Postgres is unchanged: pgvector's `<=>` with HNSW already avoids a full scan.
- Rejected for now: binary or int8 quantised vectors with re-ranking, and an approximate index. Both change results, need a new index layout and are not needed once the exact scan is this cheap; they stay the way out past about 1M chunks (ADR 0022).
