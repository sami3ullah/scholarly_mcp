# SM-11 Landing sessions and Next.js landing page (Phase 4b)

## Tasks

- [x] Session store: random 128-bit token, 24 h expiry, ordered DOIs + matched chunk ids, no query text; rate-limited token resolver API (`GET /landing/v1/page`, `POST /landing/v1/visits`: shared secret, Host check, per-visitor bucket; ADR 0032)
- [x] Links: token + DOI + UTM (`utm_source=mcp`, `utm_medium=ai`, `utm_campaign=<tool>`); `collectionUrl` (built in SM-09: core `buildLandingUrl`, sessions stored per card-returning call, ADR 0025)
- [x] `apps/landing` Next.js App Router per "React and Next.js conventions": chosen article, match list, matched passage, access options, related reading
- [x] Matched passage comes from abstract or title only, never full text (ADR 0003); a session's `matchedChunkId` may point at a full-text chunk, show the abstract then (ADR 0025). A full-text match names its section only, and the schema strips any text
- [x] Expired/unknown token falls back to DOI article page; `noindex` + canonical; mobile-first. Unknown DOI: real 307 to doi.org; dead link without DOI: real 404 (no `loading.tsx` on the route, ADR 0032)
- [x] Referral beacon (client-side, fires once, prefetch UAs filtered, GET never consumes token)
- [x] Playwright, axe, Lighthouse CI (LCP < 2.5 s): 28 e2e tests on desktop and mobile against a stub API; CI job `landing`

## Exit

Search -> one click -> personalised page; Playwright suite green.

**Result (2026-11-03):** met.

- **Search to page.** A real `search_articles` call on the live index ("Vorhofflimmern Antikoagulation") gave five cards. Opening the second card's link rendered that article first, in German, with "Ihre Ergebnisse zu Atrial Fibrillation, Treatment Outcome", the other four results in order and three related articles. It took 0.2-0.27 s.
- **Fallbacks.** An unknown DOI answers 307 to doi.org, and a dead token without a DOI answers 404.
- **Lighthouse (mobile settings).** LCP 620-628 ms on the live page and about 620 ms on the stub, with performance and accessibility at 1.0.
- **Tests.** The Playwright suite passes 28/28. Server test `landing-pages.test.ts` drives a real search into a page.
- **Checks.** `pnpm check` is green: 1,236 tests, 95.8% lines.
