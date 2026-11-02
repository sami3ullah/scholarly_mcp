# SM-02 Core domain, ports, config, errors, testkit (Phase 1)

## Tasks
- [ ] `packages/core`: zod schemas + types for Article, Chunk, SyncState, UsageEvent, IndexMeta, LandingSession, ArticleCard (plan: "Canonical records", "The article card")
- [ ] DOI normalisation (lowercase, strip `https://doi.org/`, `doi:`) with property tests
- [ ] Ports: `Source`, `ArticleReader`, `ArticleWriter`, `ArticleSearch`, `SessionStore`, `Embedder`, `Entitlements`, `Meter`, `Clock`, `RandomToken`
- [ ] `AppError` with stable codes (INVALID_INPUT, NOT_FOUND, CURSOR_STALE, RATE_LIMITED, UNAUTHORIZED, TIMEOUT, INDEX_UNAVAILABLE)
- [ ] Config loader (zod over env, fail fast), pino logger factory with redaction (no query text, no secrets)
- [ ] `packages/testkit`: builders (`anArticle()...`), in-memory fake store and source, contract suites for stores and sources
- [ ] ADRs 0001-0013 for the key design decisions

## Exit
Ports compile; contract suite passes against the in-memory fake; CI green.
