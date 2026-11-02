# SM-06 Europe PMC full-text source (Phase 2)

## Tasks

- [ ] `packages/source-europepmc`: match on DOI only, fetch OA full text for licenses in `FULLTEXT_LICENSE_ALLOWLIST` (default CC BY 4.0, CC BY-NC-ND 4.0; ADR 0003)
- [ ] Section-aware full-text extraction feeding the chunker; skip gracefully when missing or version differs
- [ ] Source contract suite + msw fixtures
- [ ] Wire into ingest pipeline behind config flag

- [ ] Store licence URL and source per full-text chunk; purge-by-licence query
- [ ] Test: no full-text chunk text ever appears in tool output, `whyMatched` or landing passage (section name only)
- [ ] Subjects from Europe PMC MeSH headings and author keywords with origin tag (ADR 0004)

## Exit

OA articles have full-text chunks used for matching only; never surfaced beyond teaser.
