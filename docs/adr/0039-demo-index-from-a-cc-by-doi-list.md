# 0039 Demo index from a CC BY DOI list

- Status: accepted
- Date: 2026-11-03
- Records: SM-14; builds on ADR 0003 (CC BY-NC-ND full text for matching only), ADR 0014 (config from the environment), ADR 0020 (Crossref source rules), ADR 0037 (server image)

## Context

The full index holds every abstract of the corpus and matching-only full-text chunks under CC BY-NC-ND (ADR 0003). Those may be used to match queries but not redistributed, so the full index can never go into a public image or a public CI artifact. Three things still need an index nobody has to build for hours: the E2E smoke test in CI, the public release image (a fresh pull should answer queries within minutes), and anyone trying the server out. The owner delegated the choice on 2026-11-03.

## Decision

1. **A DOI list in the source.** `createCrossrefSource({ dois })` looks up only the listed DOIs, 20 per page with the same `doi:` filter as the retraction follow-ups, still within the prefix, the `journal-article` type and `CROSSREF_FROM_PUB_DATE`. Its cursor holds the offset into the list; incremental runs keep works deposited since the last run. Duplicates are asked for once; DOIs Crossref does not know are counted in the log (`notFound`), never named. The ingest reads the list from `INGEST_DOIS_FILE` (one DOI per line, `#` comments), and fails before starting on a missing file, an empty list or a line that is not a DOI.
2. **The demo list.** `presets/thieme.demo-dois.txt`: 214 articles, two per journal across 111 journals (54 in German, 138 with full text), taken from the full index on 2026-11-03 where every licence Crossref lists is CC BY 4.0, the article is not retracted and has an abstract, and every indexed full-text chunk is CC BY 4.0.
3. **Built and checked by one script.** `docker/demo-index/build.sh <dir>` runs `ingest full` in the server image with the list and `FULLTEXT_LICENSE_ALLOWLIST` set to CC BY 4.0 only, then checks with `sqlite3` that every article licence and every chunk licence in the result is CC BY 4.0, and fails otherwise. A licence change at Crossref after the list was made is caught there, before anything is published.
4. **Where it is used.** The E2E smoke test bakes it into the image it starts. The public release image carries only this index (SM-14 step 9). The full index is never published: it is built with `ingest full`, or baked into a local or private image with `--build-context index=<dir>` (ADR 0037).

## Consequences

- **Rebuilt, not committed.** No binary in git: the list is the source, and CI or the release workflow builds the index from Crossref and Europe PMC in a few minutes. Those runs need the internet, and a Crossref or Europe PMC outage fails them; the HTTP client's retries cover short ones.
- **Small results.** About 214 articles and 3,200 chunks, so search answers are thin and many queries find little. The README says the public image is a demo and points to `ingest full` for the real corpus.
- **A full run with a list replaces the live index with just the listed articles**, like any full run. Set `INGEST_DOIS_FILE` only for a demo or test index.
- **Attribution.** CC BY needs attribution; every card links the article's landing page and DOI, and the licence URL is on each card.
- **Refreshing the list** is a manual query on a full index (the conditions in decision 2), reviewed in a PR like any preset change.
