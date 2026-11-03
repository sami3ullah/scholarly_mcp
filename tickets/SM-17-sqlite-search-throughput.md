# SM-17 SQLite search throughput (Phase 6 follow-up)

Found by the SM-14 load test. On the full index (70,989 articles, 176,536 chunks) one server on SQLite serves about 4 tool calls a second: each search spends about 200 ms of synchronous CPU on the event loop (the brute-force sqlite-vec scan alone is about 66 ms, ADR 0029), so calls queue behind each other. The plan asks for 20 requests a second with p95 search under 500 ms on a 2-vCPU container. On Postgres the same load passes (server at 2 vCPUs: 20/s, p50 74 ms, p95 299 ms, with Postgres at 4 vCPUs), so SQLite is the default for trials and Postgres for production load ([OPERATIONS.md](../docs/OPERATIONS.md#capacity)).

| Full index, 60 s, autocannon (`docker/e2e/load.sh`) | Served/s | p50 ms | p95 ms | p99 ms |
| --------------------------------------------------- | -------: | -----: | -----: | -----: |
| SQLite, 1 call/s                                    |        1 |    283 |    470 |    690 |
| SQLite, 4 calls/s                                   |        4 |    625 |  1,125 |  1,376 |
| SQLite, 20 calls/s offered (8 tool errors)          |      4.4 |  2,413 |  3,380 |  4,350 |

## Tasks

- [ ] Profile one search on the full SQLite index by stage (query embedding, lexical, trigram, vector scan, fusion, hydration, cards, landing session and metering writes) and record where the 200 ms go
- [ ] Pick, with an ADR, among: search on a pool of worker threads each with its own read-only connection (scales with cores), an approximate vector index instead of the full scan, cheaper lexical stages; measure each on the full index
- [ ] Reproduce the 8 tool errors seen at 20 calls/s offered and record their codes (`load.mjs` now counts them by code)
- [ ] Load test again at 20 calls/s on a 2-vCPU container, golden-set recall unchanged

## Exit

SQLite serves 20 tool calls a second on 2 vCPUs with p95 under 500 ms on the full index, or an ADR records why SQLite stays the trial store with a lower stated ceiling.
