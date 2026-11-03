# @scholarly-mcp/landing

The reference landing page (Next.js 16, App Router). It turns a card link
(`/mcp/landing?t=<token>&doi=<doi>&utm_*`) into a page built for that search, from the server's
landing API. Setup, configuration, the API contract and the rules for rebuilding it elsewhere are
in the [landing guide](../../docs/guides/landing-page.md); the decisions are in
[ADR 0032](../../docs/adr/0032-landing-api-and-reference-landing-page.md).

## Layout

| Path                               | What it holds                                                               |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `src/app/mcp/landing/`             | Thin route files: the page, its error and not-found views, the beacon route |
| `src/features/landing/components/` | Presentational components; `landing-view.tsx` composes them                 |
| `src/features/landing/hooks/`      | Client logic: the referral beacon, the expandable abstract                  |
| `src/features/landing/server/`     | `server-only` calls to the landing API, with the DOI fallbacks              |
| `src/features/landing/model/`      | Pure helpers: link parameters, links, dates, prefetch detection             |
| `src/shared/`                      | Design tokens' UI primitives (button link, badge), messages (en, de), env   |
| `e2e/`                             | Playwright suite, the stub landing API and the Lighthouse server script     |

## Scripts

```bash
pnpm --filter @scholarly-mcp/landing dev        # http://localhost:3000, needs the server's landing API
pnpm --filter @scholarly-mcp/landing build
pnpm --filter @scholarly-mcp/landing e2e        # after build; Playwright + axe on desktop and mobile
pnpm --filter @scholarly-mcp/landing lhci       # after build; Lighthouse budgets
```
