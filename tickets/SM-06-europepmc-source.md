# SM-06 Europe PMC full-text source (Phase 2)

## Tasks

- [x] `packages/source-europepmc`: match on DOI only, fetch OA full text for licenses in `FULLTEXT_LICENSE_ALLOWLIST` (default CC BY 4.0, CC BY-NC-ND 4.0; ADR 0003)
- [x] Section-aware full-text extraction feeding the chunker; skip gracefully when missing or version differs
- [x] Source contract suite + msw fixtures (an enricher contract: Europe PMC enriches articles rather than paging a corpus, ADR 0024)
- [x] Wire into ingest pipeline behind config flag (`EUROPEPMC_ENABLED`, on in the Thieme preset)

- [x] Store licence URL and source per full-text chunk; purge-by-licence query (`ingest purge-license <url>`)
- [x] Test: no full-text chunk text ever appears in tool output, `whyMatched` or landing passage (section name only). Covered for the search service; SM-09 extends it to tool output, SM-11 to the landing passage
- [x] Subjects from Europe PMC MeSH headings and author keywords with origin tag (ADR 0004)
- [x] Exit check on the live corpus: full rebuild with enrichment, second run writes 0 rows, verify passes, a full-text-only query finds an article

## Exit

OA articles have full-text chunks used for matching only; never surfaced beyond teaser.

**Result (2026-11-02):** passed. Full Thieme rebuild with `EUROPEPMC_ENABLED=true` in 2 h 50 min, `exit 0`, every verify check green:

|                                              |     Before (SM-05) |                                        With enrichment |
| -------------------------------------------- | -----------------: | -----------------------------------------------------: |
| Articles                                     |             70,911 |                                                 70,911 |
| Chunks                                       |             89,388 |                             176,433 (87,045 full text) |
| Articles with full text                      |                  - |                 6,861 (5,020 CC BY, 1,841 CC BY-NC-ND) |
| Articles with subjects                       |                  - |          13,600 (62,180 MeSH, 19,255 keyword subjects) |
| Index file                                   |             551 MB |                                               1,322 MB |
| `pnpm eval bench --rounds 5` p50 / p95 / max | 104 / 132 / 193 ms | 204 / 287 / 303 ms (3 runs, within 2 ms of each other) |

- 15,844 articles were embedded and 55,067 reused from the previous index. 11 referenced full texts were skipped: 7 had no text, 2 had a licence mismatch in the JATS, 2 were still failing after retries. There were 8 retried requests and no errors.
- The next `ingest incremental` fetched 2 articles, both unchanged, and wrote 0. `ingest verify` exited 0.
- Full-text-only query: words that occur only in the full text of an article with no abstract (`duodenography`, `pseudodiverticular`, `subtumoral`, `localising`) find that article at rank 2 each time. `whyMatched` names the section only ("Matched in Discussion (full text): localising"), and the teaser is empty. The rank-1 hits are a ranking issue, recorded in SM-08.
- Latency doubled with the chunk count (the vector scan, ADR 0022) and stays under the 500 ms bench limit.
