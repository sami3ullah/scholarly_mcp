# Phase 0 spike results (2026-11-02)

Scripts live in `spikes/` (throwaway). Sample: first 500 Crossref records for prefix 10.1055, `type:journal-article`, `from-pub-date:2024-01-01`.

## Crossref coverage (n = 500)

| Field                               | Coverage           | Notes                                              |
| ----------------------------------- | ------------------ | -------------------------------------------------- |
| Abstract                            | 236 (47%)          | Plan expects ~37% corpus-wide; sample skews higher |
| License                             | 79 (16%)           | 40 CC BY 4.0, 39 CC BY-NC-ND 4.0, all `vor`        |
| Language                            | 500 (100%)         | de 307 (61%), en 193 (39%)                         |
| Authors                             | 338 (68%)          | Optional field confirmed                           |
| Date precision                      | day 201, month 299 | Month-only dates are the majority                  |
| Subject                             | 0 (0%)             | Crossref has no subjects for these records         |
| `update-to` (retraction/correction) | 0                  | None in sample; need a targeted fixture            |
| `relation`                          | 2                  |                                                    |
| Distinct journals                   | 67                 |                                                    |

## Europe PMC (CC-licensed subset, n = 79)

- Found by DOI: 67; with PMCID: 62; full text in Europe PMC: 62 (78%).

## Embeddings and vector store

multilingual-e5-small (`Xenova/multilingual-e5-small`, q8) via transformers.js, sqlite-vec 0.1.9, better-sqlite3.

| Runtime                        | Top-1 (10 DE queries vs 10 EN abstracts) | Avg query | Model load (incl. download) |
| ------------------------------ | ---------------------------------------- | --------- | --------------------------- |
| macOS arm64, Node 24.21        | 10/10                                    | 3 ms      | 50 s                        |
| Docker linux/arm64, Node 24.22 | 10/10                                    | 5 ms      | 61 s                        |
| Docker linux/amd64 (emulated)  | 10/10                                    | 25 ms     | 62 s                        |

Caveat: the 10 docs cover distinct topics, so this is an easy test. The real check is the 60-query golden set in SM-08.

## MCP

`@modelcontextprotocol/sdk` 1.32.2 + zod 4: stdio server with one tool, listed and called from the SDK client. Claude Desktop / MCP Inspector check is manual.

## Findings that affect the design

1. **No subjects in Crossref.** The plan uses subjects for `get_journal`, the landing page topic label and indexing. Needs another source (see open questions).
2. **Some "abstracts" are just a citation** of the original article (translated republications). The JATS cleaner must detect and drop citation-only abstracts so we don't index or tease them.
3. **No retractions in sample.** SM-03 needs a targeted query (`filter=update-type:retraction` on prefix 10.1055) to build fixtures.
4. **License mix:** half of the CC records are BY-NC-ND. The plan's full-text allowlist says "CC BY".
5. **Model load time** is dominated by download; the image must bake the model in, and readiness must wait for it (already in plan).

## Decision

Go with multilingual-e5-small (ADR 0002).

## Owner decisions (2026-11-02)

- CC BY-NC-ND full text allowed for matching only, never shown: [ADR 0003](adr/0003-cc-by-nc-nd-full-text-for-matching-only.md).
- Subjects from Europe PMC MeSH and keywords, journal-level fallback: [ADR 0004](adr/0004-subjects-from-europe-pmc.md).
- Crossref public pool, no mailto for now: [ADR 0005](adr/0005-crossref-public-pool.md).
