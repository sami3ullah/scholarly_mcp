# SM-03 Crossref source and normalisation pipeline (Phase 2)

## Tasks
- [ ] `packages/source-crossref`: cursor paging (`cursor=*`), polite pool `mailto`, exponential backoff with jitter, honour `Retry-After`, checkpoint per page
- [ ] Incremental sync on `from-update-date` with 1-day overlap; expired cursor restarts from last checkpointed window
- [ ] Filter to `journal-article`; flag errata
- [ ] JATS cleaner: tags, MathML, entities, leading "Abstract", keep section labels; snapshot tests on SM-00 fixtures
- [ ] Text normalisation: NFC, strip soft hyphens / zero-width / control chars
- [ ] License gate: version-of-record license, embargo start date, unknown = metadata only
- [ ] Retractions/corrections from Crossref update relations
- [ ] `contentHash` per record
- [ ] msw integration tests with injected 429/500/timeouts; source contract suite passes

## Exit
Source contract suite and integration tests green; every ingestion edge case in the plan has a test.
