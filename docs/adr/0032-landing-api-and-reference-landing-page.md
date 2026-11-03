# 0032 Landing API and reference landing page

- Status: accepted
- Date: 2026-11-03
- Records: SM-11; builds on ADR 0017 (tokens), ADR 0025 (link format), ADR 0003 (full text never shown)

## Context

SM-09 already stores each card-returning call's results under a random token and puts it in every link (`/mcp/landing?t=&doi=&utm_*`). SM-11 needs the other half: something that turns a link into a personalised page, a beacon that counts real visits, and a Next.js reference page that a publisher's web team can rebuild in its own stack. PLAN.md fixes the page's parts, the fallbacks and the testing tools, but not where page data comes from, how the lookup is protected or how fallbacks reach the browser.

## Decision

1. **The server composes the page.** A landing API on the existing HTTP listener returns a complete page model: `GET /landing/v1/page?t=<token>&doi=<doi>`. The landing app only renders it. A publisher rebuilding the page calls one endpoint and needs no index, search or entitlement logic of its own. The model is `landingPageSchema` in core. The server checks its output against it, and the app checks its input against the same schema.
2. **What a page holds.** The page holds the chosen article and the access decision for it. With a live session it adds the search's other results in their original order, where the chosen article matched, topic labels and up to three related articles that were not results. The abstract is shown in full, since this is the publisher's own site. The heading names the topic from MeSH and keyword subjects that the results share; it falls back to the chosen article's own subjects. It never uses the query.
3. **Chosen article.** The chosen article is the link's DOI. Without a DOI (the collection link), it is the first result still in the index. A DOI outside the session's results opens that article with all results as matches.
4. **Matched passage.** An abstract chunk is quoted with its section. A metadata chunk says the title matched. A full-text chunk names only its generic section label, and the schema strips any text passed with it (ADR 0003, ADR 0025).
5. **Fallbacks.** An expired, unknown or malformed token with a DOI shows the article alone (`session: unavailable`) with an expiry notice. No token at all gives `session: none`. When no page exists, the API answers 404. The app then redirects a link with a DOI to `https://doi.org/<doi>` with a real 307. A link without a DOI gets a real 404 not-found page. If the API is down, rate-limited or returns something invalid, a link with a DOI still goes to doi.org. Only a link without a DOI reaches the error page.
6. **No `loading.tsx` on the landing route** (deviation from PLAN.md React conventions). A loading boundary makes Next.js stream the shell first and fixes the status at 200. The redirect then becomes a meta refresh and not-found answers 200, which previews and crawlers misread. The page waits for one API call (about 0.2 s on the live index), so a skeleton adds nothing to LCP.
7. **Visits.** Reading a page never counts or consumes anything, so link previews cannot use a token up.
   - **Browser side.** A client beacon sends `{ t, tool }` once per token and tab, using `sessionStorage` plus a ref, so StrictMode, reloads and moves between results do not repeat it. It waits for `prerenderingchange` on a prerendered page and posts to the app's `/mcp/landing/visit`.
   - **App route.** The route drops preview agents (Slack, WhatsApp, Discord, Teams/Skype previews, crawlers, headless browsers), `Sec-Purpose: prefetch` requests and cross-site posts. It forwards the rest to `POST /landing/v1/visits`.
   - **Server.** The server counts only live tokens (`visitCount` and `landing_visits_total{tool}`). It answers 204 whether or not the token is known.
8. **Guarding the API.**
   - **Shared secret.** `LANDING_API_SECRET` is sent as a bearer token and compared in constant time. It is required when HTTP listens beyond loopback.
   - **Host allowlist.** The same Host check as `/mcp` applies (DNS rebinding).
   - **Per-visitor rate limit.** A token bucket keyed by `x-landing-visitor`, with defaults `LANDING_RATE_LIMIT_PER_MINUTE=120` and `LANDING_RATE_LIMIT_BURST=30`. The app sends a salted SHA-256 of the reader's forwarded address in that header, never the address itself.
   - **Metrics and caching.** `landing_pages_total{session}` counts pages. Responses are `no-store` and `noindex`.
9. **Side systems never fail a page.** If the session store fails, the page falls back to the DOI. If entitlements fail, access comes from the record. If related reading fails or times out, the page goes without it. Each failure is logged once.
10. **HTTP alongside stdio.** `HTTP_ALONGSIDE_STDIO=true` serves health, metrics and the landing API (but no `/mcp`) while MCP runs on stdio. Links from Claude Desktop then open a working page. If the port is taken, stdio keeps working and the failure is logged.
11. **The app.**
    - **Stack.** Next.js 16 App Router with server components; the only client components are the beacon, the abstract toggle and the error view. CSS Modules sit on design tokens in `globals.css`.
    - **Language.** English and German strings come from one dictionary. The page uses the search's language, else the chosen article's.
    - **SEO.** `noindex, nofollow` is set in both meta and header, with the article's page as canonical.
    - **Dependencies.** The app may import only core and the logger (dependency-cruiser), and hooks and model code may not import server code.
    - **Access.** The access decision is made on the server per request, so the planned `use-access-status` hook is not needed.
12. **Tests.** The Playwright suite and Lighthouse CI run against a stub landing API with synthetic articles, so they run in GitHub CI without an index or real content (ADR 0030 keeps the index local).
    - **Playwright.** 28 tests run on desktop and mobile, including axe for WCAG 2.1 AA.
    - **Lighthouse budgets.** LCP under 2.5 s, CLS under 0.1, accessibility score 1, performance and best practices at least 0.9.

## Consequences

- **Measured locally.** Against the live index, a German search's link renders in about 0.2-0.27 s. Lighthouse on mobile settings measured LCP 620-628 ms, with performance and accessibility at 1.0 (stub: about 620 ms). An unknown DOI answers 307 to doi.org, and a dead link answers 404.
- **Several replicas.** The per-visitor limit and sessions are per process. Sessions move to Postgres in SM-13, and shared limits are an SM-14 follow-up (done in ADR 0036).
- **Funnel data.** `visitCount` lives on the session row and is deleted with it after 24 h. The SM-12 funnel needs visit events in the metering outbox (follow-up added there).
- **Untranslated topic labels.** Topics are MeSH labels, which are English, so a German page reads "Ihre Ergebnisse zu Atrial Fibrillation". German MeSH labels would need a source (follow-up candidate).
- **Image build.** `output: 'standalone'` is left for the SM-14 image, because `next start` refuses it.
