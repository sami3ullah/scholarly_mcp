# 0033 Referral events, funnel report and MCP Apps card view

- Status: accepted
- Date: 2026-11-03
- Records: SM-12; builds on ADR 0031 (metering outbox), ADR 0032 (landing API and beacon), ADR 0018 (result rendering)

## Context

PLAN.md asks for two things in Phase 4b. The first is a funnel: searches, cards shown per journal, landing visits, and what visitors did next, without storing query text. The second is an MCP Apps card list for clients that support it. After SM-11, a landing visit only bumps the session's `visitCount` and a Prometheus counter, and both are gone after 24 h or a restart. The metering outbox only knows tool calls and deletes exported events after 30 days, so it is not a history store. Nothing records which card was opened or what the reader did on the page.

The owner chose three options (session 13): a CLI that writes a static funnel report from the JSON lines export, visits counted per token and DOI, and a beacon on the landing page's access buttons.

## Decision

1. **One event stream, three kinds.** `UsageEvent` becomes a union on `kind`, and all three kinds share `id`, `apiKeyId`, `occurredAt` and `billable`.
   - **`tool_call`.** What SM-10 recorded, plus `cardsByJournal`: how many cards each journal had in an answer. Failed calls and tools without cards have an empty list. Only tool calls can be billable.
   - **`landing_visit`.** A reader opened one result of a search: `doi`, its `journal`, and the session's `tool` when known. `billable` is always `false`, so a billing consumer that sums billable events stays correct.
   - **`landing_action`.** A reader clicked an access button: the same fields plus `action` (`read`, `sign_in`, `buy`, `view_on_publisher`, `check_access`).
   - **Why one stream.** Referral events reuse the outbox's durability, retries, exporters and SIGTERM flush. A second pipeline would duplicate all of it.
2. **No token in any event.** A referral event's id is `sha256(kind, token, doi[, action])` in base64url. The id is deterministic, so a second tab, a retried beacon or a second server process cannot count the same visit twice: the outbox ignores a known id, and the funnel dedupes on it. The hash of a 128-bit random token cannot be reversed. Ids of different kinds differ, so events cannot be joined back into one reader's session.
3. **What counts.** The server records a referral only when the token is live and the DOI is one of the session's results, and it takes the journal from the index. A forged or replayed beacon therefore cannot inflate one journal's numbers. Links without a token (related reading, the DOI fallback) are not attributed. `visitCount` and `landing_visits_total{tool}` stay as they were. `landing_actions_total{action}` is new.
4. **Landing API v1 changes before release.**
   - **Visits.** `POST /landing/v1/visits` takes `{ t, doi, tool? }`. The `doi` is now required.
   - **Actions.** New `POST /landing/v1/actions` takes `{ t, doi, action }`, with the same secret, rate limit and 204 answer as visits.
   - **Session tool.** Sessions store the tool that made them (`tool`, optional for sessions stored before this change), so the server no longer trusts `utm_campaign` when the session knows better.
5. **Browser side.**
   - **Visit beacon.** It fires once per token, DOI and tab, so a second card opened from the chat counts. A move between results on the landing page does not count: that page's own links drop the UTM tags (ADR 0032), and the beacon skips pages reached from a same-origin referrer without UTM tags.
   - **Action beacon.** A client wrapper around the access buttons sends one `sendBeacon` per token, DOI, action and tab to `/mcp/landing/action`. That app route has the visit route's guards (preview agents, prefetch, cross-site).
6. **Outbox storage.** Runtime migration 3 rebuilds `usage_events` as an envelope plus a JSON payload: `id, kind, api_key_id, occurred_at, exported_at, payload`. Existing rows are copied as `tool_call` with an empty `cardsByJournal`. The outbox never queries by tool, so kind-specific columns would only need more migrations. SM-13's Postgres outbox uses the same shape with `jsonb`.
7. **Wire format.** Moved to core: `toWireEvent` and `parseWireEvent`. Every exported line carries `kind`. Tool-call lines keep all their SM-10 fields and add `cardsByJournal`. The JSON lines file is the durable event log: unlike the outbox, it is never pruned.
8. **Funnel report.**
   - **Computation.** `computeFunnel(events, { from, to, apiKeyId })` in core is a pure function. It dedupes by id and returns totals, per journal (cards shown, visits, actions, click-through), per tool, per client (API key), per action and per day. A search is a successful `search_articles` call. Cards shown come from successful card-returning calls.
   - **CLI.** `scholarly-mcp funnel --from usage.jsonl [--since --until --key] --out funnel.html [--json funnel.json]` streams the export line by line. It skips and counts malformed lines, then writes one self-contained HTML report (no scripts from elsewhere, light and dark themes) and, if asked, the JSON.
   - **Why a CLI.** It reads exactly the events a publisher's warehouse gets, needs no new storage, and its numbers can be checked against recorded events in tests. It is not live: a live view is a follow-up once events land in Postgres or a warehouse.
9. **MCP Apps card view.**
   - **Package.** New `packages/card-view`: browser code built by esbuild into one self-contained HTML string (`CARD_VIEW_HTML`). It uses the official `App` class from `@modelcontextprotocol/ext-apps`.
   - **Registration.** The server registers it as `ui://scholarly-mcp/cards.html` with the MCP Apps MIME type and no network access in its CSP, and points `search_articles` at it through `_meta.ui.resourceUri`.
   - **What it shows.** It renders `structuredContent.cards`: title, journal, year, teaser, access badge and a "Read on {publisher}" button. The button opens the card's landing link through `app.openLink`, falling back to `window.open`. Labels follow the host locale (de, en) and the theme follows the host.
   - **Fallback.** Clients without MCP Apps ignore the metadata and show the same text with links as before (ADR 0018).

## Consequences

- **Wire format change.** Billing consumers see a new `kind` field and non-billable referral lines. Consumers that sum `billable` events need no change. Those that assumed every line is a tool call must filter on `kind`.
- **Click-through per client.** The report shows click-through (visits per card shown) per client and per journal. That is the measure PLAN.md uses to tell when a client drops links.
- **Measured on our page only.** Next actions are measured on the reference landing page. A publisher who rebuilds the page must send the action beacon too. Actions on the publisher's own article pages (completed purchases, logins) are outside this funnel.
- **Not live.** The funnel needs a run of the CLI over the export. A live dashboard waits for SM-13 (Postgres) or a warehouse.
- **Metric and funnel differ on repeats.** `landing_visits_total` counts accepted beacons per process, so a beacon repeated from another tab adds to it. The funnel counts unique events by id. Reported numbers come from the funnel.
- **View size.** The card view is about 600 KB (130 KB gzipped). Most of it is zod and the MCP client that the SDK's `app-with-deps` build bundles. The client fetches it once per connection and may cache it, and tool responses stay small.
- **Measured live.** Against the real index over stdio: `search_articles` carries the UI metadata, and the resource is served as `text/html;profile=mcp-app`. A visit and an action for a returned card landed in the JSON lines file as token-free events with the card's journal. A repeated visit was stored once, a forged DOI recorded nothing, and `funnel` reported 1 search, 5 cards, 1 visit and 1 action.
- **Manual check still pending.** A real client renders the cards only after a manual check in Claude Desktop or another MCP Apps host. The automated test drives the view through the SDK's `AppBridge`.
