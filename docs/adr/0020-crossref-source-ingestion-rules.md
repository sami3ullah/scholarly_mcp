# 0020 Crossref source: paging, notices, retractions and failure rules

- Status: accepted
- Date: 2026-11-02
- Fills gaps in: ARCHITECTURE.md "Edge cases and failure handling" (ingestion rows)

## Context

The plan names the Crossref edge cases but not how to handle several facts found while building the adapter (all checked against the live API on 2026-11-02):

- `language` cannot be requested with `select`, so responses cannot be trimmed to the fields we use.
- `from-update-date` matches whole UTC days; a timestamp is accepted but its time is ignored. It filters on `deposited`.
- Cursor paging works with `sort=deposited&order=asc`. An expired or unknown cursor returns HTTP 404 with `type: cursor-invalid`. The last full page still carries a `next-cursor`; the empty page after it does not.
- The public pool advertises `x-rate-limit-limit: 1`, `x-rate-limit-interval: 1s` and `x-concurrency-limit: 1`.
- Retraction notices carry `update-to` pointing at the retracted article; the article carries `updated-by`. Retraction Watch also annotates some articles with an `update-to` pointing at themselves. Thieme re-deposits a retracted article as "Retracted Article: …", but that is a publisher habit, not a guarantee.
- Many Thieme errata have no update relation at all, only a title such as "Erratum: …".
- Some Thieme "abstracts" are only a citation of the original article (translated republications), and some structured abstracts run their headings into the text without markup ("Results A total of …").

## Decision

1. **Walk** `/prefixes/{prefix}/works` filtered to `type:journal-article` (and `from-pub-date` when `CROSSREF_FROM_PUB_DATE` is set), sorted by deposit date ascending, full records. The source's opaque cursor encodes Crossref's cursor, the walk's lower bound and the latest deposit seen (the watermark).
2. **Incremental windows**: the source honours `updatedSince` exactly, filtering the day-granular Crossref result by the instant itself, so the source contract holds. The one-day overlap lives in core's `incrementalWindow`, which ingestion (ADR 0022) uses to choose `updatedSince`; a failed run retries from its own window start.
3. **Expired cursor**: restart once with a fresh cursor from the watermark day and drop records deposited before the watermark. Records at the watermark itself may be emitted twice; upserts are idempotent. A fresh cursor that is also rejected fails the page.
4. **Notices are skipped**, not flagged: errata, corrections, retraction notices and expressions of concern are identified by update relation (`update-to` pointing at another DOI) or, failing that, by title. The canonical `Article` has no erratum flag, and a notice is not something a reader should discover. Counts of skipped records are logged per page.
5. **Retractions**: an article is retracted when `updated-by` or a self-pointing `update-to` has type `retraction`, `withdrawal` or `removal`, or its title starts "Retracted …". When a page holds a retraction notice, the retracted article is marked on the same page or looked up by DOI (within the same scope) and emitted as retracted, with `sourceUpdatedAt` no earlier than the notice. This catches retractions even when the original was not re-deposited. A partial retraction or expression of concern does not retract.
6. **Failures**: 429, 5xx, timeouts, network errors and truncated JSON are retried with exponential backoff and full jitter (1 s base, 60 s cap), waiting at least `Retry-After`. A `Retry-After` beyond the cap fails fast as `RATE_LIMITED` with `retryAfterSeconds`, so the scheduler can come back later. Requests are spaced by the advertised rate limit. Other 4xx responses and unexpected shapes are not retried. Exhausted retries raise a new core error code, `SOURCE_UNAVAILABLE` (ingestion only, never shown to a model).
7. **Records**: a malformed item or one that fails the canonical schema (no title, ISSN or year) is skipped and counted, never fixing up data. Citation-only abstracts are dropped. Standard EN/DE structured-abstract headings at the start of a paragraph become section labels. `isOpenAccess` means the active version-of-record licence is Creative Commons; it is evaluated at ingestion time. The landing URL is the deposited one, falling back to `https://doi.org/{doi}`.
8. **JATS** is parsed with `htmlparser2` (tolerant, decodes HTML entities) rather than regular expressions.

## Consequences

- Full records cost more bandwidth (~10 kB per article), acceptable for ~71k articles.
- An embargoed article opens in the index only when its record is ingested again after the start date. Incremental runs do not re-fetch unchanged records, so a periodic full run (ADR 0022) is what opens embargoes. Revisit if embargoed CC articles become common.
- Title-based notice detection can miss notices with unusual titles; those stay indexed as ordinary articles. The patterns are tested against real titles and against article titles that only start like notices ("Correction of hallux valgus").
