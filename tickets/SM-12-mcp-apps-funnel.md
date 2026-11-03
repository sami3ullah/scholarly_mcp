# SM-12 MCP Apps cards and funnel dashboard (Phase 4b)

## Tasks

- [ ] MCP Apps card-list UI resource for `search_articles` (title, journal, teaser, access badge, "Read on Thieme" button); plain-text fallback
- [ ] Funnel dashboard: searches -> cards shown per journal -> landing visits -> next action; no query text
- [ ] Landing visits as metering events (from SM-11): `POST /landing/v1/visits` only bumps the session's `visitCount` (deleted with the session after 24 h) and `landing_visits_total{tool}`. Record a visit event in the outbox (token-free: tool, api key id of the session, time) so the funnel survives session cleanup
- [ ] Per-card visits (from SM-11): the beacon counts once per token; decide whether the funnel needs which DOI was opened (send `doi` in the beacon)

## Exit

Cards render in a supporting client; funnel numbers match recorded events in tests.
