# SM-11 Landing sessions and Next.js landing page (Phase 4b)

## Tasks
- [ ] Session store: random 128-bit token, 24 h expiry, ordered DOIs + matched chunk ids, no query text; rate-limited token resolver API
- [ ] Links: token + DOI + UTM (`utm_source=mcp`, `utm_medium=ai`, `utm_campaign=<tool>`); `collectionUrl`
- [ ] `apps/landing` Next.js App Router per "React and Next.js conventions": chosen article, match list, matched passage, access options, related reading
- [ ] Expired/unknown token falls back to DOI article page; `noindex` + canonical; mobile-first
- [ ] Referral beacon (client-side, fires once, prefetch UAs filtered, GET never consumes token)
- [ ] Playwright, axe, Lighthouse CI (LCP < 2.5 s)

## Exit
Search -> one click -> personalised page; Playwright suite green.
