# SM-12 MCP Apps cards and funnel dashboard (Phase 4b)

## Tasks

- [x] MCP Apps card-list UI resource for `search_articles` (title, journal, teaser, access badge, "Read on Thieme" button); plain-text fallback
- [x] Funnel dashboard: searches -> cards shown per journal -> landing visits -> next action; no query text
- [x] Landing visits as metering events (from SM-11): `POST /landing/v1/visits` only bumps the session's `visitCount` (deleted with the session after 24 h) and `landing_visits_total{tool}`. Record a visit event in the outbox (token-free: tool, api key id of the session, time) so the funnel survives session cleanup
- [x] Per-card visits (from SM-11): the beacon counts once per token; decide whether the funnel needs which DOI was opened (send `doi` in the beacon)

## Decisions (owner, session 13; ADR 0033)

- **Funnel report.** The funnel is a CLI that reads the JSON lines export and writes a static HTML report (`scholarly-mcp funnel`), not a live page.
- **Per-result visits.** Visits count per token and DOI: the beacon sends the opened DOI, and the server checks it against the session's results and records its journal.
- **Next actions.** They come from a beacon on the landing page's access buttons (`POST /landing/v1/actions`).

## Exit

Cards render in a supporting client; funnel numbers match recorded events in tests.

- **Cards.** A Chromium test hosts the built card view through the MCP Apps SDK's `AppBridge` and checks the rendered cards and a link opened through the host. Protocol tests check the tool metadata and the resource over HTTP and stdio. The manual Claude Desktop check is still open (see the handoff).
- **Funnel.** `funnel-command.test.ts` runs a search, visits and an action through the real wiring, exports the events twice and checks the report's totals and journal row against them.

## Follow-ups

- Live funnel view once events sit in Postgres (SM-13).
- Card view in Claude Desktop, checked by hand (open since SM-09 for links).
