# @scholarly-mcp/ingest

The ingestion CLI: the only writer of the index (key design decision 3). It pages through Crossref, adds Europe PMC subjects and matching-only full text when enabled, chunks and embeds what changed, builds the index next to the live one, verifies it and swaps it in. How to run and schedule it: [ingestion guide](../../docs/guides/ingestion.md). Design rules: [ADR 0022](../../docs/adr/0022-sqlite-index-files-and-builds.md).

| Command                      | What it does                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ingest full`                | Re-fetches everything into a new file, reusing embeddings of unchanged articles                                        |
| `ingest incremental`         | Fetches records updated since the last run (1-day overlap); becomes `full` when one is due                             |
| `ingest verify`              | Checks the live index (integrity, counts, model version, sample queries) without changing it                           |
| `ingest purge-license <url>` | Removes all full text indexed under a licence through a verified build; take it off `FULLTEXT_LICENSE_ALLOWLIST` first |

Exit codes: `0` done, `1` failed or not verified (the live index is unchanged), `2` bad usage.

## Configuration

Everything from the [Crossref source](../../packages/source-crossref/README.md), the [Europe PMC enricher](../../packages/source-europepmc/README.md), the [embedder](../../packages/embedder-onnx/README.md) and the [SQLite store](../../packages/store-sqlite/README.md), plus:

| Variable               | Default | Meaning                                                                                                                                 |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `INGEST_FULL_RUN_DAYS` | `7`     | An incremental run turns full when the last full run is this many days old                                                              |
| `EUROPEPMC_ENABLED`    | `false` | Add Europe PMC subjects and matching-only full text ([ADR 0024](../../docs/adr/0024-europe-pmc-enrichment.md)); on in the Thieme preset |
| `LOG_LEVEL`            | `info`  | Pino log level                                                                                                                          |
