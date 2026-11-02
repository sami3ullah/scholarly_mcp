# SM-02 Core domain, ports, config, errors, testkit (Phase 1)

## Tasks

- [x] `packages/core`: zod schemas + types for Article, Chunk, SyncState, UsageEvent, IndexMeta, LandingSession, ArticleCard (plan: "Canonical records", "The article card")
- [x] DOI normalisation (lowercase, strip `https://doi.org/`, `doi:`) with property tests
- [x] Ports: `Source`, `ArticleReader`, `ArticleWriter`, `ArticleSearch`, `SessionStore`, `Embedder`, `Entitlements`, `Meter`, `Clock`, `RandomToken`
- [x] `AppError` with stable codes (INVALID_INPUT, NOT_FOUND, CURSOR_STALE, RATE_LIMITED, UNAUTHORIZED, TIMEOUT, INDEX_UNAVAILABLE)
- [x] Subject with origin (`mesh`, `keyword`, `journal`); chunk carries source + licence (ADR 0003, 0004)
- [x] Config loader (zod over env, fail fast), pino logger factory with redaction (no query text, no secrets) in `packages/logger` (ADR 0019)
- [x] `packages/testkit`: builders (`anArticle()...`), in-memory fake store and source, contract suites for stores and sources
- [x] ADRs for the key design decisions (0006-0018, since 0001-0005 were already taken) plus ADR 0019 for the logger package and core boundaries

## Exit

Ports compile; contract suite passes against the in-memory fake; CI green.

## Notes

- Also added a `SyncStateStore` port with its own contract suite (ADR 0019).
- Root `lint` and `test` scripts now build workspace packages first, so a fresh checkout (and CI) can resolve `@scholarly-mcp/core` types.
