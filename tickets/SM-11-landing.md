# SM-11 Landing sessions and Next.js landing page (Phase 4b)

## Tasks

- [ ] Session store: random 128-bit token, 24 h expiry, ordered DOIs + matched chunk ids, no query text; rate-limited token resolver API
- [x] Links: token + DOI + UTM (`utm_source=mcp`, `utm_medium=ai`, `utm_campaign=<tool>`); `collectionUrl` (built in SM-09: core `buildLandingUrl`, sessions stored per card-returning call, ADR 0025)
- [ ] `apps/landing` Next.js App Router per "React and Next.js conventions": chosen article, match list, matched passage, access options, related reading
- [ ] Matched passage comes from abstract or title only, never full text (ADR 0003); a session's `matchedChunkId` may point at a full-text chunk, show the abstract then (ADR 0025)
- [ ] Expired/unknown token falls back to DOI article page; `noindex` + canonical; mobile-first
- [ ] Referral beacon (client-side, fires once, prefetch UAs filtered, GET never consumes token)
- [ ] Playwright, axe, Lighthouse CI (LCP < 2.5 s)

## Exit

Search -> one click -> personalised page; Playwright suite green.
