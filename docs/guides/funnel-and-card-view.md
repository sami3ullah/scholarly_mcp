# The funnel and the card view

[← Back to the docs index](../README.md)

This guide covers two things from SM-12 ([ADR 0033](../adr/0033-referral-events-funnel-and-card-view.md)), and the live funnel from SM-13 ([ADR 0035](../adr/0035-live-funnel-over-stored-events.md)):

- **The funnel.** How the server measures what happens after a search, from cards shown to landing visits to what readers do next, and how to read the report.
- **The card view.** How `search_articles` shows its results as cards in clients that support MCP Apps.

## What the funnel counts

```mermaid
flowchart LR
  S[Searches] --> C[Cards shown<br/>per journal]
  C --> V[Landing visits<br/>per journal]
  V --> A[Next actions<br/>read, sign in, buy, ...]
```

| Step               | Counted when                                                                                    | Event            |
| ------------------ | ----------------------------------------------------------------------------------------------- | ---------------- |
| **Searches**       | A `search_articles` call succeeds                                                               | `tool_call`      |
| **Cards shown**    | A successful `search_articles`, `find_related` or `get_article` answer holds cards, per journal | `tool_call`      |
| **Landing visits** | A reader's browser opens one result of a live search on the landing page                        | `landing_visit`  |
| **Next actions**   | A reader clicks an access button on that page                                                   | `landing_action` |

Click-through is visits per card shown. A client whose cards are shown but almost never opened probably hides or rewrites the links (PLAN.md risks). Callers are anonymous ([ADR 0048](../adr/0048-public-server-without-auth.md)), so the report counts all clients together; a click-through well below the usual rate across all traffic is the sign to look for.

### What is in an event

Every event goes through the metering outbox and its exporters ([Operating the server](operating-the-server.md#usage-metering)):

```json
{"id":"9a97…","kind":"tool_call","tool":"search_articles","resultCount":5,"latencyMs":958,"status":"ok","billable":true,"cardsByJournal":[{"journal":"DMW - Deutsche Medizinische Wochenschrift","cards":3},{"journal":"Pneumologie","cards":2}],"occurredAt":"2026-11-03T08:26:55.360Z"}
{"id":"BD-o…","kind":"landing_visit","tool":"search_articles","doi":"10.1055/a-2646-5752","journal":"DMW - Deutsche Medizinische Wochenschrift","billable":false,"occurredAt":"2026-11-03T08:26:56.340Z"}
{"id":"wGJU…","kind":"landing_action","action":"read","tool":"search_articles","doi":"10.1055/a-2646-5752","journal":"DMW - Deutsche Medizinische Wochenschrift","billable":false,"occurredAt":"2026-11-03T08:26:56.345Z"}
```

- **No query text, no token.** A visit or action id is a SHA-256 of kind, token, DOI and action. The same visit from a second tab or a retried beacon gets the same id, so it is stored and counted once.
- **Checked against the session.** The server records a referral only when the token is live (24 h) and the DOI is one of that search's results. The journal comes from the index, not from the browser.
- **Never billable.** Visits and actions have `billable: false`.
- **Lines from before SM-12.** The funnel still reads lines without `kind`: they are tool calls with no card counts.

### Which visits count

- **Once per token, result and tab.** A second card opened from the chat counts. A reload does not.
- **Moves on the page.** A move to another result on the landing page does not count: the page's own links carry no UTM tags, and the beacon skips pages reached from the same site without them.
- **Previews.** Link previews, prefetches and posts from other sites are dropped (ADR 0032).
- **No token.** Links without a token (related reading, the DOI fallback) are not attributed.

`landing_visits_total` in `/metrics` counts accepted beacons per process, so a repeated beacon adds to it. The funnel counts unique visits from the events. Use the funnel for numbers you report.

## Writing the report

The report reads the JSON lines export (`METER_JSONL_PATH`, default `data/usage.jsonl`, in the image `/var/lib/scholarly/usage.jsonl`). That file is the durable event log: the outbox deletes exported events after 30 days, the file keeps them.

```bash
source ~/.nvm/nvm.sh && nvm use
pnpm --filter @scholarly-mcp/server build

# Everything in the export
node --env-file=presets/thieme.env apps/server/dist/main.js funnel \
  --from data/usage.jsonl --out data/funnel.html --json data/funnel.json

# One week (UTC days; --since inclusive, --until exclusive)
node apps/server/dist/main.js funnel --from data/usage.jsonl --out data/funnel-week.html \
  --since 2026-11-01 --until 2026-11-08
```

The command prints the four totals and writes:

- **HTML.** One self-contained HTML page with no scripts and nothing loaded from elsewhere, so it can be mailed or archived. It has light and dark themes and a table for every chart.
- **JSON.** With `--json`, the same numbers for a spreadsheet or a warehouse.

Lines that are not events (for example a write torn by a crash) are skipped and counted, never fatal.

| Section      | Read it as                                                                       |
| ------------ | -------------------------------------------------------------------------------- |
| Totals       | The four steps and overall click-through                                         |
| Funnel       | Each step with its rate from the step before (cards per search, visits per card) |
| By journal   | Cards, visits, click-through and actions per journal                             |
| Next actions | Clicks per access button                                                         |
| By tool      | Calls, failures, cards and visits per tool                                       |
| By day       | The steps per UTC day                                                            |

A publisher with a warehouse can skip the CLI: the webhook delivers the same events, and `computeFunnel` in `@scholarly-mcp/core` documents the counting rules.

### From the store

`--store` reads the events in the store `STORE` picks instead of a file: the runtime database on SQLite, `scholarly.usage_events` on Postgres. Every replica appends there, so the numbers are current. The outbox deletes exported events after `METER_RETENTION_DAYS` (30), so the store covers the recent weeks only; the report names its source and that window. For longer periods use the export.

```bash
# Postgres, as the server's role (it may read usage_events)
STORE=postgres DATABASE_URL=postgres://scholarly_server:server-local@127.0.0.1:5432/scholarly \
  node --env-file=presets/thieme.env apps/server/dist/main.js funnel --store --out data/funnel.html
```

## The live view

`--serve` keeps the report open in a browser: every request counts the events in the store now.

```bash
STORE=postgres DATABASE_URL=postgres://scholarly_server:server-local@127.0.0.1:5432/scholarly \
  node --env-file=presets/thieme.env apps/server/dist/main.js funnel --store --serve
# Live funnel at http://127.0.0.1:8092/ (Ctrl+C stops it)
```

| Route              | Answers                                          |
| ------------------ | ------------------------------------------------ |
| `GET /`            | The report, which reloads itself every 60 s      |
| `GET /funnel.json` | The same numbers as JSON                         |
| `?since=…&until=…` | Filters for either route, as on the command line |

- **Options.** `--host` (default `127.0.0.1`), `--port` (8092) and `--refresh` (60 s, 5 to 3600). `--since` and `--until` set the filters for requests that bring none.
- **Load.** A count is reused for `--refresh` seconds per filter set, and requests meanwhile share one read, so open tabs do not pile up on the database. A failed read answers 503 and is retried on the next request.
- **No login.** The view has none, and it shows your usage numbers. Keep it on loopback and reach it with `ssh -L 8092:127.0.0.1:8092 <host>`, or put it behind a proxy with its own login. It warns when bound to another address.
- **Separate process.** It is not a route of the MCP server, whose HTTP surface is public. It needs only read access to the events and stops on SIGINT or SIGTERM.

## The landing page side

The reference landing page sends both beacons. If you rebuild the page in your own stack, send them too ([The landing page](../LANDING.md#rebuilding-the-page-in-your-own-stack)):

- **Visits.** `POST /landing/v1/visits` with `{ "t", "doi", "tool" }`, once per token, result and tab, after the page is shown.
- **Actions.** `POST /landing/v1/actions` with `{ "t", "doi", "action" }`, when an access button is clicked. The action is one of `read`, `sign_in`, `buy`, `view_on_publisher` or `check_access`. Use `sendBeacon`, so the request survives the navigation the click starts.

Both routes take the landing API secret and answer 204 whether or not anything was recorded.

## The card view (MCP Apps)

`search_articles` declares a UI resource, `ui://scholarly-mcp/cards.html`, in its tool metadata (`_meta.ui.resourceUri`). A client that supports MCP Apps, such as Claude, renders the result as cards:

- **What a card shows.** Title, journal, year, first author, teaser and access badge.
- **The read button.** A "Read on {publisher}" button (German: "Bei {publisher} lesen") that opens the landing link through the client.
- **The collection link.** It opens one page with all results.

Every other client ignores the metadata and shows the same results as text with links, as before.

- **Self-contained.** The view is one HTML page built by `packages/card-view` (about 600 KB, 130 KB gzipped). It declares no network access, makes no requests and sets card text as text, never as HTML.
- **Publisher name.** It comes from `PUBLISHER_NAME`.
- **Language and theme.** Labels follow the client's locale (German or English), and colours and fonts follow the client's theme where it shares them.
- **Rebuild.** `pnpm --filter @scholarly-mcp/card-view build` rebuilds it (also part of `pnpm build`).

### Check it in a client

The automated test hosts the built view in Chromium through the MCP Apps SDK's `AppBridge`. That is the same bridge a client uses, but not a real client. To see it in Claude Desktop, connect the server as in [Connecting clients](connecting-clients.md) with `HTTP_ALONGSIDE_STDIO=true` and ask a clinical question. The answer should show cards with a read button.
