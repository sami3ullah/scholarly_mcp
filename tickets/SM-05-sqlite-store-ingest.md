# SM-05 SQLite store and ingest CLI (Phase 2)

## Tasks
- [ ] `packages/store-sqlite`: `articles`, `chunks`, `chunks_fts` (FTS5 `unicode61 remove_diacritics 2`), trigram FTS table, `vec_chunks` (sqlite-vec `float[384]`), `sync_state`, `index_meta`, `landing_sessions`, `usage_events`
- [ ] German/English Snowball stemming in TS into `text_stemmed`; folded copy for umlaut/ß variants
- [ ] Idempotent upsert by DOI in transactions; skip re-embedding when `contentHash` unchanged; refuse mixed model versions
- [ ] Build into new file, verify (counts + sample queries), atomic rename; server reopens on new `IndexMeta.version`
- [ ] Store contract suite passes
- [ ] `apps/ingest` CLI: `ingest full`, `ingest incremental`, `ingest verify`

## Exit
2024+ corpus indexed from scratch; a second run changes 0 rows; verify report passes.
