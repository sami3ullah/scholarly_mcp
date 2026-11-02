# SM-06 Europe PMC full-text source (Phase 2)

## Tasks

- [x] `packages/source-europepmc`: match on DOI only, fetch OA full text for licenses in `FULLTEXT_LICENSE_ALLOWLIST` (default CC BY 4.0, CC BY-NC-ND 4.0; ADR 0003)
- [x] Section-aware full-text extraction feeding the chunker; skip gracefully when missing or version differs
- [x] Source contract suite + msw fixtures (an enricher contract: Europe PMC enriches articles rather than paging a corpus, ADR 0024)
- [x] Wire into ingest pipeline behind config flag (`EUROPEPMC_ENABLED`, on in the Thieme preset)

- [x] Store licence URL and source per full-text chunk; purge-by-licence query (`ingest purge-license <url>`)
- [x] Test: no full-text chunk text ever appears in tool output, `whyMatched` or landing passage (section name only). Covered for the search service; SM-09 extends it to tool output, SM-11 to the landing passage
- [x] Subjects from Europe PMC MeSH headings and author keywords with origin tag (ADR 0004)
- [ ] Exit check on the live corpus: full rebuild with enrichment, second run writes 0 rows, verify passes, a full-text-only query finds an article

## Exit

OA articles have full-text chunks used for matching only; never surfaced beyond teaser.
