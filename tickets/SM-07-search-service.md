# SM-07 Search service (Phase 3)

## Tasks

- [x] Query validation: trim, NFC, strip control chars and soft hyphens, cap 500 chars; empty = INVALID_INPUT; stopword-only = vector-only
- [x] DOI shortcut; exact title boost
- [x] Language detection; dual stemming when uncertain; DE/EN abbreviation map
- [x] Safe FTS query building (tokenise and quote every token, never raw MATCH); property test with random strings
- [x] Parallel lexical top 50 + vector top 50 with identical filters (language, journal, years, OA, retracted excluded)
- [x] RRF k=60, tie-break newer then DOI; collapse to one result per DOI with best chunk
- [x] Teaser builder (<= 280 chars, word boundary, conclusion sentence else first sentence); `whyMatched`
- [x] Opaque cursor with offset + index version; CURSOR_STALE on mismatch
- [x] 2 s budget via AbortSignal, TIMEOUT; LRU query-embedding cache
- [x] Keep the vector side within budget: SM-05 measured the exact scan at about 60 ms for 90k chunks (ADR 0022); re-measure end to end with the embedder
- [x] Folding, Snowball stemming and quoting already happen in `store-sqlite` (ADR 0022); the service passes plain terms and tunes the BM25 weights in SM-08

- [x] Search service in its own package `packages/search` (core and zod only), config section `SEARCH_*`, `apps/eval bench` for latency (ADR 0023)

## Exit

All search edge cases tested; p95 < 500 ms on the local corpus.

**Result (2026-11-02):** passed. `pnpm eval bench --rounds 5` on the live index (70,911 articles, 89,388 chunks) with the real ONNX embedder and the embedding cache off: 225 searches, p50 104 ms, p95 132 ms, max 193 ms; no failures, no empty result lists. Edge cases are covered by unit tests, a service-level property test (any string gives results or `INVALID_INPUT`) and a store contract property test (any terms never fail a store).
