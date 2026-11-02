# 0024 Europe PMC enrichment: subjects and matching-only full text

- Status: accepted
- Date: 2026-11-02
- Fills gaps in: PLAN.md "Europe PMC has no match or a different version", key design decision #11, ADR 0003 and ADR 0004, ticket SM-06

## Context

ADR 0003 allows open access full text under CC BY 4.0 and CC BY-NC-ND 4.0 for matching only, and ADR 0004 takes subjects from Europe PMC. Neither says how Europe PMC fits the ports, how a "different version" is recognised, how a full-text heading stays out of `whyMatched`, or how rebuilds avoid fetching every text again. Facts found while building it (live API, 2026-11-02):

- `GET /search?query=DOI:"a" OR DOI:"b" …&resultType=core&format=json&pageSize=1000` answers 100 DOIs in one request (about 1.7 s, 330 kB). `core` results carry `pmcid`, `isOpenAccess`, `inEPMC`, `license` (`cc by`, `cc by-nc-nd`, no version), `authMan` / `epmcAuthMan` / `nihAuthMan`, `fullTextIdList`, `meshHeadingList`, `keywordList` and `fullTextReceivedDate`. With everything on one page there is no `nextCursorMark`.
- Of 200 random open access Thieme articles in the index, Europe PMC matched 115 and 110 had full text it may index; of 100 closed ones, 18 matched (MeSH only). One closed article is held as an author manuscript (`authMan: Y`).
- A record can match a DOI query yet carry no `doi` field (a `PMC` source record).
- `GET /{PMCID}/fullTextXML` returns JATS. A PMCID without full text answers HTTP 500 with a JSON body, not 404. A JSON-only `accept` header gets 406. Time to first byte is 1.2 to 2.5 s per text.
- The JATS licence element often has no link; the licence URL appears in free text. `custom-meta` flags include `is-manuscript`, `is-preprint` and `is-retracted`.
- Section headings vary: English with `disp-level`, German without ("Hintergrund", "Methoden", "Ergebnisse"), case reports with paragraphs before the first section, and back matter inside `<body>` (footnotes, contributor information, "Tables 1s–6s, Fig. 1s", ethics, data availability, an erratum).
- MeSH check tags (`Humans`, `Male`, `Aged`, ...) are on almost every record.

## Decision

1. **An enricher port, not a source.** Europe PMC does not page through a corpus; it adds to articles Crossref emitted. Core gets `ArticleEnricher` with `lookup(articles)`, which returns subjects and an optional full-text reference per matched DOI, and `fetchFullText(doi, ref)`, which returns sections or `undefined`. The testkit has an in-memory enricher and `runEnricherContract`, which the adapter runs on recorded fixtures.
2. **The article records a reference, not text.** `Article.fullText` is `{ source, id (PMCID), licenseUrl, revision (fullTextReceivedDate) }`. Enrichment sets subjects and the reference and recomputes `contentHash`, so the hash covers both: a new revision or a licence change re-indexes the article, and an unchanged reference lets a full rebuild reuse the article's chunks without fetching the text again. Turning enrichment off drops both on the next run.
3. **Match on DOI only.** A hit counts only when its own `doi` equals the requested DOI; preprints (`PPR`) are ignored; with two hits, the one with a PMCID wins. DOIs containing `"` or `\` are not queried.
4. **When full text may be used.** All of these must hold, or the article is indexed from metadata only:
   - Crossref's version-of-record licence is in force and on `FULLTEXT_LICENSE_ALLOWLIST`
   - the article is not retracted
   - Europe PMC has `isOpenAccess` and `inEPMC`, and the PMCID is in `fullTextIdList`
   - no author-manuscript flag is set
   - Europe PMC's licence family equals Crossref's (`cc by-nc-nd` against `/licenses/by-nc-nd/4.0/`)
   - the JATS states the same DOI
   - the JATS is not flagged manuscript, preprint or retracted
   - the JATS has no `custom-meta` text and data mining reservation
   - any Creative Commons licence the JATS states (by link or in its permissions text) is of that family

   The stored licence is Crossref's URL, because Europe PMC's field has no version.

5. **What is read.** Only `<body>`; never `<front>` (the abstract comes from Crossref) or `<back>`. Top-level sections become sections, nested ones fold into their parent, prose before the first section forms an unlabelled section. Figures, tables, formulas, captions, labels and citation markers are dropped, and the empty brackets they leave are removed. Back matter is skipped by `sec-type` or by an English or German heading pattern.
6. **Generic labels only.** A heading is article content, and `whyMatched` names the matched section, so headings are mapped to `Introduction`, `Methods`, `Results`, `Discussion`, `Conclusion` or `Case report` (EN and DE patterns) and otherwise dropped. Core's `fullTextSectionSchema` allows nothing else, and ingestion, not the adapter, stamps origin `fulltext`, source and licence on each section, so an adapter cannot produce a displayable or unlicensed full-text chunk.
7. **Subjects.** MeSH descriptor names without qualifiers or check tags (origin `mesh`), and up to 20 author keywords as plain text (origin `keyword`), deduplicated per origin, at most 120 characters each. Subjects come from every match, open access or not. The journal-level fallback of ADR 0004 is the preset's job (SM-14).
8. **Ingest order.** Each page is looked up in one batched call per 100 DOIs. For each article:
   1. Enrich it.
   2. Skip it if the index holds the same hash.
   3. Reuse the previous index's chunks if they have the same hash and model.
   4. Otherwise fetch the full text. If it is unusable, drop the reference, recompute the hash and repeat steps 2 and 3. An article whose text never arrives is then not re-embedded on every run, so a repeated run still writes 0 rows.
   5. Chunk and embed the article.

   It is behind `EUROPEPMC_ENABLED` (default off; on in the Thieme preset).

9. **Failures.** The shared HTTP client (`@scholarly-mcp/http`, moved out of the Crossref adapter) spaces requests by `EUROPEPMC_REQUEST_GAP_MS` (200 ms; Europe PMC publishes no limit), honours `Retry-After` and retries 429, 5xx, timeouts and network errors (3 times). A failed search fails the page, so the run resumes from its checkpoint. A full text that is missing (4xx), unusable or still failing after retries is skipped and logged with its reason; five failures in a row raise `SOURCE_UNAVAILABLE`, because then Europe PMC is down and every remaining article would only wait out its retries. Rate limiting is never skipped; it fails the run with `RATE_LIMITED`.
10. **Purge by licence.** `ingest purge-license <url>` copies the live index (a `purge` build), deletes every full-text chunk under that licence and the articles' references in one transaction, verifies and swaps. It refuses a licence still on the allowlist, as the next run would index the text again. The articles keep their old hash, so the next run re-indexes them from what it fetches.
11. **Fixtures.** Search fixtures keep only the fields the adapter reads. Full-text fixtures are committed verbatim and only under CC BY, which allows redistribution with attribution; CC BY-NC-ND cases are covered by small synthetic JATS, so no ND text is published with the code.

## Consequences

- Open access articles without an abstract become findable by their full text; the reader still sees only the abstract teaser and a link (ADR 0016). `whyMatched` says "Matched in Methods (full text): <query terms>".
- The index grows: full text adds roughly 10 to 15 chunks per article for about half of the open access articles, so the vector scan time (ADR 0022) grows with it. The live numbers are in the SM-06 ticket.
- The first build with enrichment fetches every eligible text one at a time, a few hours at Europe PMC's latency. Later full runs fetch only new or revised texts. If that ever matters, a small fixed concurrency for full-text fetches is the next step.
- Heading patterns are English and German; other languages' sections are indexed unlabelled.
- A text whose licence Europe PMC states differently from Crossref is not used, even if one of them is wrong; this errs on the side of not using text.
