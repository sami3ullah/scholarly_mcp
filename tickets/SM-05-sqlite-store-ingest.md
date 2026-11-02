# SM-05 SQLite store and ingest CLI (Phase 2)

## Tasks

- [x] `packages/store-sqlite`: `articles`, `chunks`, `chunks_fts` (FTS5 `unicode61 remove_diacritics 2`), trigram FTS table, `vec_chunks` (sqlite-vec `float[384]`), `sync_state`, `index_meta`, `landing_sessions`, `usage_events`
- [x] German/English Snowball stemming in TS into `text_stemmed`; folded copy for umlaut/ß variants
- [x] Idempotent upsert by DOI in transactions; skip re-embedding when `contentHash` unchanged; refuse mixed model versions
- [x] Build into new file, verify (counts + sample queries), atomic rename; server reopens on new `IndexMeta.version`
- [x] Store contract suite passes
- [x] `apps/ingest` CLI: `ingest full`, `ingest incremental`, `ingest verify`
- [x] Incremental runs take `updatedSince` from core `incrementalWindow` (1-day overlap, failed runs retry their window); checkpoint `SyncState` after every page; schedule a periodic full run so embargoed licences open (ADR 0020)

- [ ] Exit check on the layout-2 index (see handoff)

## Exit

2024+ corpus indexed from scratch; a second run changes 0 rows; verify report passes.
