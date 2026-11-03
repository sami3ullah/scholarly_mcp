# @scholarly-mcp/card-view

The MCP Apps card list for `search_articles` ([ADR 0033](../../docs/adr/0033-referral-events-funnel-and-card-view.md)). A client that supports MCP Apps renders the search result as cards: title, journal, year, first author, teaser, access badge and a "Read on {publisher}" button. Every other client shows the same result as text with links.

```ts
import { CARD_VIEW_URI, cardViewHtml } from '@scholarly-mcp/card-view';

cardViewHtml({ publisher: 'Thieme' }); // one self-contained HTML page
CARD_VIEW_URI; // 'ui://scholarly-mcp/cards.html'
```

- **Build.** `pnpm --filter @scholarly-mcp/card-view build`. esbuild bundles `src/view` with the MCP Apps SDK (`@modelcontextprotocol/ext-apps`) and inlines the result into `dist/card-view.html`. The page loads nothing from elsewhere.
- **Links.** The button and the "all results" link open the landing link through the host (`app.openLink`), falling back to `window.open`. Only http(s) links are opened.
- **Safety.** Card text is set as text, never as HTML, and a malformed result shows "no articles".
- **Locale and theme.** Labels follow the host locale (German or English). Colours, fonts and radii follow the host's MCP Apps style variables, with built-in light and dark fallbacks.
- **Layout.** Browser code lives in `src/view` with its own DOM tsconfig. `src/index.ts` is the Node entry the server imports.

Tests: jsdom covers rendering (fields, German, links through the host, HTML injection, malformed results). A Chromium test hosts the built page through the SDK's `AppBridge`, as a client would. It sends a tool result, checks the cards and a link opened through the host, and switches the locale. Run `pnpm --filter @scholarly-mcp/card-view exec playwright install chromium` once.
