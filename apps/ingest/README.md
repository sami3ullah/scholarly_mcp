# @scholarly-mcp/ingest

The ingestion CLI: the only writer of the index (key design decision 3). It pages through Crossref, adds Europe PMC subjects and matching-only full text when enabled, chunks and embeds what changed, builds the index next to the live one, verifies it and swaps it in. How to run and schedule it: [ingestion guide](../../docs/guides/ingestion.md). Design rules: [ADR 0022](../../docs/adr/0022-sqlite-index-files-and-builds.md).

| Command                                                    | What it does                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest full`                                              | Re-fetches everything into a new file, reusing embeddings of unchanged articles                                                                                                                                                               |
| `ingest incremental`                                       | Fetches records updated since the last run (1-day overlap); becomes `full` when one is due or `EMBEDDER_MODEL` changed                                                                                                                        |
| `ingest verify`                                            | Checks the live index (integrity, counts, model version, sample queries) without changing it                                                                                                                                                  |
| `ingest migrate`                                           | Brings the runtime tables up to date; on Postgres also grants `PG_SERVER_ROLE` its access. Run it before the server starts, and after each upgrade ([Postgres guide](../../docs/guides/postgres.md))                                          |
| `ingest copy --from <index>`                               | Replaces the live index with a verified copy of a SQLite index file, with its embeddings and sync state, such as `data/index.sqlite` into Postgres; nothing is fetched or embedded                                                            |
| `ingest purge-license <url>`                               | Removes all full text indexed under a licence through a verified build; take it off `FULLTEXT_LICENSE_ALLOWLIST` first                                                                                                                        |
| `ingest subset --from <index> --dois <file> --out <index>` | Builds a verified index of chosen articles from a bigger one, reusing their chunks and embeddings, such as the eval index ([ADR 0026](../../docs/adr/0026-golden-set-eval-and-tuning.md)); writes only to `--out`                             |
| `ingest reembed --from <index> --out <index>`              | Copies an index with every chunk embedded again by `EMBEDDER_MODEL`, chunking unchanged, to compare models on the same text ([ADR 0028](../../docs/adr/0028-selectable-embedding-model.md)); resumes when interrupted; writes only to `--out` |

Exit codes: `0` done, `1` failed or not verified (the live index is unchanged), `2` bad usage.

## Configuration

`STORE` (`sqlite` or `postgres`, default `sqlite`) picks where the index lives: the file at `INDEX_PATH`, or Postgres at `DATABASE_URL` as the writer role ([ADR 0034](../../docs/adr/0034-postgres-store-adapter.md)). `subset` and `reembed` always read and write SQLite files. `migrate` needs only the store settings.

Everything from the [Crossref source](../../packages/source-crossref/README.md), the [Europe PMC enricher](../../packages/source-europepmc/README.md), the [embedder](../../packages/embedder-onnx/README.md), the [SQLite store](../../packages/store-sqlite/README.md) and the [Postgres store](../../packages/store-postgres/README.md), plus:

| Variable                | Default | Meaning                                                                                                                                        |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGEST_FULL_RUN_DAYS`  | `7`     | An incremental run turns full when the last full run is this many days old                                                                     |
| `EUROPEPMC_ENABLED`     | `false` | Add Europe PMC subjects and matching-only full text ([ADR 0024](../../docs/adr/0024-europe-pmc-enrichment.md)); on in the Thieme preset        |
| `JOURNAL_SUBJECTS_FILE` | unset   | Journal-level subjects for articles without article-level ones ([ADR 0004](../../docs/adr/0004-subjects-from-europe-pmc.md))                   |
| `INGEST_DOIS_FILE`      | unset   | Limits the index to the DOIs listed in this file, such as the demo index ([ADR 0039](../../docs/adr/0039-demo-index-from-a-cc-by-doi-list.md)) |
| `LOG_LEVEL`             | `info`  | Pino log level                                                                                                                                 |
