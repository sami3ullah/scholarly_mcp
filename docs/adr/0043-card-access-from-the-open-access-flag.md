# 0043 Card access from the open access flag

- Status: accepted
- Date: 2026-11-03
- Records: SM-15; amends ADR 0025 decision 4

## Context

ADR 0025 gave a card's `access` badge three values from the record alone: `open` for open access, `subscription` when a closed version-of-record licence is in force, and `unknown` otherwise. It expected most subscription cards to show `unknown`, because Thieme deposits no licence for most closed articles.

On the full Thieme index that is what happens, and it is wrong for the reader: 57,844 of 70,989 articles carry no licence, and every one of them is a closed article. A paywalled Endoscopy trial shows `access unknown` on its card while `check_access` answers `subscription` with login and purchase links. The demo's paywall question (SM-15) shows both answers side by side.

Facts from the full index (2026-11-03):

- Every one of the 13,048 open access articles carries an open (Creative Commons) licence; open access is defined that way at ingestion (`isOpenAccess` is an open licence in force, ADR 0020).
- No fully open access journal has an article without a licence. The only journal above half open access with unlicensed articles is a hybrid journal (Methods of Information in Medicine, 26 of 41 open).
- The mock entitlement adapter (ADR 0025 decision 5) already answers `subscription` for every article that is not open access and the caller has no institution.

## Decision

1. **A card's `access` is `open` for open access and `subscription` otherwise.** Licence information no longer decides the badge; `license` still carries the version-of-record licence URL in force, or `unknown`.
2. **The schemas keep `unknown`.** `ArticleCard.access` and the landing page's access status keep the value, because an entitlement adapter may still answer it and the card view and landing page render it. The record-based badge no longer produces it.

## Consequences

- Cards, the landing page's match list and its fallback when the entitlement check fails now agree with `check_access` for a reader without an institution.
- A publisher that deposits no licence with its open access articles would see them as `subscription`. Its preset would then need a source of open access status before cards can be trusted; the ingestion rule (ADR 0020) has the same dependency already, since `openAccessOnly` filters on the same flag.
- A reader with institutional access still sees `subscription` on the card; `check_access` gives the caller-specific answer, as before.
