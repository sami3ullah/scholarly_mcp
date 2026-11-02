# 0017 Random 128-bit landing tokens with a 24-hour expiry

- Status: accepted
- Date: 2026-11-02
- Records: PLAN.md key design decision #12

## Context

The landing page must rebuild a search's results, but a query may contain patient details and must never appear in URLs, logs, referrers or forwarded links.

## Decision

Each search stores its ordered result DOIs (and matched chunk ids) under a random 128-bit token, base64url-encoded to 22 characters, for 24 hours (`LANDING_SESSION_TTL_MS`). `LandingSession` has no field for query text, so the schema strips it if passed. Tokens come from the `RandomToken` port and time from `Clock`, so tests are deterministic. An expired or unknown token falls back to the article page.

## Consequences

- Forwarded links work for anyone until expiry and reveal nothing personal.
- Revisit when Thieme wants personalisation tied to logged-in accounts.
