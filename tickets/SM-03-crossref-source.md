# SM-03 Crossref source and normalisation pipeline (Phase 2)

## Tasks

- [x] `packages/source-crossref`: cursor paging (`cursor=*`), optional `CROSSREF_MAILTO` (public pool when unset, ADR 0005), exponential backoff with jitter, honour `Retry-After`, checkpoint per page
- [x] Incremental sync on `from-update-date` with 1-day overlap; expired cursor restarts from last checkpointed window
- [x] Filter to `journal-article`; flag errata
- [x] JATS cleaner: tags, MathML, entities, leading "Abstract", keep section labels; snapshot tests on SM-00 fixtures
- [x] Text normalisation: NFC, strip soft hyphens / zero-width / control chars
- [x] License gate: version-of-record license, embargo start date, unknown = metadata only
- [x] Retractions/corrections from Crossref update relations
- [x] `contentHash` per record
- [x] msw integration tests with injected 429/500/timeouts; source contract suite passes

## Exit

Source contract suite and integration tests green; every ingestion edge case in the plan has a test.
