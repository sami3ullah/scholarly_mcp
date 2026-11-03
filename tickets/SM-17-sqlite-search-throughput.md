# SM-17 SQLite search throughput (Phase 6 follow-up)

Found by the SM-14 load test. On the full index (70,989 articles, 176,536 chunks) one server on SQLite serves about 4 tool calls a second: each search spends about 200 ms of synchronous CPU on the event loop (the brute-force sqlite-vec scan alone is about 66 ms, ADR 0029), so calls queue behind each other. The plan asks for 20 requests a second with p95 search under 500 ms on a 2-vCPU container. On Postgres the same load passes (server at 2 vCPUs: 20/s, p50 74 ms, p95 299 ms, with Postgres at 4 vCPUs), so SQLite is the default for trials and Postgres for production load ([OPERATIONS.md](../docs/OPERATIONS.md#capacity)).

| Full index, 60 s, autocannon (`docker/e2e/load.sh`) | Served/s | p50 ms | p95 ms | p99 ms |
| --------------------------------------------------- | -------: | -----: | -----: | -----: |
| SQLite, 1 call/s                                    |        1 |    283 |    470 |    690 |
| SQLite, 4 calls/s                                   |        4 |    625 |  1,125 |  1,376 |
| SQLite, 20 calls/s offered (8 tool errors)          |      4.4 |  2,413 |  3,380 |  4,350 |

## Tasks

- [x] Profile one search on the full SQLite index by stage (query embedding, lexical, trigram, vector scan, fusion, hydration, cards, landing session and metering writes) and record where the 200 ms go: 174 ms vector scan (scalar cosine, page copies, the distance computed twice), 21 ms FTS5, 2 ms embedding, under 1 ms hydration ([ADR 0040](../docs/adr/0040-sqlite-vector-scan-by-euclidean-distance.md))
- [x] Pick, with an ADR, among: search on a pool of worker threads each with its own read-only connection (scales with cores), an approximate vector index instead of the full scan, cheaper lexical stages; measure each on the full index: the exact scan first ([ADR 0040](../docs/adr/0040-sqlite-vector-scan-by-euclidean-distance.md), 200 → 50 ms), then worker threads ([ADR 0041](../docs/adr/0041-sqlite-search-on-worker-threads.md), 29 → 58 searches a second natively with 2)
- [x] Reproduce the 8 tool errors seen at 20 calls/s offered and record their codes (`load.mjs` now counts them by code): all `TIMEOUT` (13 of 266 on 2 vCPUs), calls queued past the 2 s search budget
- [x] Load test again at 20 calls/s on a 2-vCPU container, golden-set recall unchanged: 19.4/s served, p50 344, p95 517, p99 900 ms, 1 `TIMEOUT` in 1,167 calls; golden set equal to the baseline
- [x] p95 is at the 500 ms line, not under it: build sqlite-vec with NEON/AVX in the image (Linux scan 65 ms against 29 ms on macOS). Compiled from the pinned, checksummed release ([ADR 0042](../docs/adr/0042-sqlite-vec-compiled-with-simd-in-the-image.md)): scan 65.8 → 32.5 ms; at 20 calls/s on 2 vCPUs 19.6 to 19.9/s served, p50 about 220, p95 346 to 361, p99 618 to 1,122 ms, no `TIMEOUT` in three runs; top 50 identical to the scalar build for 100 queries

## Exit

SQLite serves 20 tool calls a second on 2 vCPUs with p95 under 500 ms on the full index, or an ADR records why SQLite stays the trial store with a lower stated ceiling.
