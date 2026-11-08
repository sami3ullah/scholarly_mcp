# 0003 Allow CC BY-NC-ND open access full text for matching only

- Status: accepted (owner decision, 2026-11-02)
- Deviates from: ARCHITECTURE.md key design decision 11 ("full text used only for matching, under a CC BY allowlist")

## Context

In the feasibility spike sample, half of the openly licensed records (39 of 79) are CC BY-NC-ND 4.0; the rest are CC BY 4.0. A CC BY-only allowlist would drop half of the full text that can improve matching for the ~53% of articles with no abstract. The owner approved using them, on condition that no data or compliance rule is broken.

## Decision

Full text under **CC BY 4.0** and **CC BY-NC-ND 4.0** (version-of-record license, start date in the past) may be indexed for **matching only**. The license allowlist becomes a config value, `FULLTEXT_LICENSE_ALLOWLIST`, defaulting to these two.

Guardrails, each enforced in code and covered by a test:

1. **Never shown, anywhere.** Full-text chunks are never returned in tool output, teasers, `whyMatched` text or the landing page's "matched passage". `whyMatched` for a full-text hit names only the section ("matched in Methods"), never quotes it. The landing page's matched passage falls back to the abstract or title.
2. **No redistribution or adaptation.** Chunks and embeddings stay inside the index; no export, bulk endpoint or API returns them. This respects ND (no adapted material is shared) and keeps the use within text and data mining.
3. **Source and licence per chunk.** Each full-text chunk stores its licence URL and source (`europepmc`), so it can be purged per licence by one query if a rights holder or Thieme asks.
4. **Official API only.** Full text comes only from the Europe PMC open access subset via its REST API, matched by DOI. No publisher-site fetching.
5. **Honour opt-outs.** Records whose licence is unknown, embargoed or not on the allowlist are metadata only. If a machine-readable text and data mining reservation is found for a source, ingestion skips it.
6. **Non-commercial demo.** The prototype is a non-commercial demonstration aimed at the rights holder.

## Why this is defensible

- Under EU copyright law (Directive (EU) 2019/790, Art. 3 and 4), text and data mining of lawfully accessible works is permitted unless the rights holder has reserved it. CC 4.0 licences do not restrict uses covered by such exceptions.
- No licensed text reaches the reader through this system; it only ranks links back to the rights holder's own site.

## Consequences

- Better recall for title-only and short-abstract articles.
- Commercial production use by a publisher should be confirmed by its legal team. For Thieme content, Thieme is the rights holder, so this is a policy choice for them; the allowlist is configurable for exactly that reason.
- This is an engineering assessment, not legal advice.
