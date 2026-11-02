# SM-06 Europe PMC full-text source (Phase 2)

## Tasks

- [ ] `packages/source-europepmc`: match on DOI only, fetch OA full text for CC BY allowlisted licenses only
- [ ] Section-aware full-text extraction feeding the chunker; skip gracefully when missing or version differs
- [ ] Source contract suite + msw fixtures
- [ ] Wire into ingest pipeline behind config flag

## Exit

OA articles have full-text chunks used for matching only; never surfaced beyond teaser.
