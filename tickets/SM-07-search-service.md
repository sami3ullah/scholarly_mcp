# SM-07 Search service (Phase 3)

## Tasks

- [ ] Query validation: trim, NFC, strip control chars and soft hyphens, cap 500 chars; empty = INVALID_INPUT; stopword-only = vector-only
- [ ] DOI shortcut; exact title boost
- [ ] Language detection; dual stemming when uncertain; DE/EN abbreviation map
- [ ] Safe FTS query building (tokenise and quote every token, never raw MATCH); property test with random strings
- [ ] Parallel lexical top 50 + vector top 50 with identical filters (language, journal, years, OA, retracted excluded)
- [ ] RRF k=60, tie-break newer then DOI; collapse to one result per DOI with best chunk
- [ ] Teaser builder (<= 280 chars, word boundary, conclusion sentence else first sentence); `whyMatched`
- [ ] Opaque cursor with offset + index version; CURSOR_STALE on mismatch
- [ ] 2 s budget via AbortSignal, TIMEOUT; LRU query-embedding cache
- [ ] Keep the vector side within budget: SM-05 measured the exact scan at about 60 ms for 90k chunks (ADR 0022); re-measure end to end with the embedder
- [ ] Folding, Snowball stemming and quoting already happen in `store-sqlite` (ADR 0022); the service passes plain terms and tunes the BM25 weights in SM-08

## Exit

All search edge cases tested; p95 < 500 ms on the local corpus.
