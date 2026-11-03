import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps/app-with-deps';
import { labelsFor } from './labels.js';
import { cardListOf, renderCards, type CardList } from './render-cards.js';

/*
 * The MCP Apps card view (ADR 0033). The host renders this page in a sandboxed iframe and
 * sends it the `search_articles` result; the page shows the cards and opens links through
 * the host. It makes no network requests of its own.
 */
const root = document.getElementById('cards');
const config = readConfig();
const app = new App({ name: 'scholarly-mcp-cards', version: '1.0.0' }, {}, { autoResize: true });
let latest: CardList | undefined;

function draw(context: McpUiHostContext | undefined) {
  if (root === null) return;
  const labels = labelsFor(context?.locale ?? navigator.language);
  document.documentElement.lang = labels === labelsFor('de') ? 'de' : 'en';
  if (latest === undefined) {
    root.textContent = labels.waiting;
    return;
  }
  renderCards(root, latest, {
    labels,
    publisher: config.publisher,
    open: (url) => {
      app.openLink({ url }).catch(() => window.open(url, '_blank', 'noopener'));
    },
  });
}

function style(context: McpUiHostContext | undefined) {
  if (context?.theme !== undefined) applyDocumentTheme(context.theme);
  if (context?.styles?.variables !== undefined) applyHostStyleVariables(context.styles.variables);
  if (context?.styles?.css?.fonts !== undefined) applyHostFonts(context.styles.css.fonts);
}

app.addEventListener('toolresult', (result) => {
  latest = cardListOf(result.structuredContent);
  draw(app.getHostContext());
});
app.addEventListener('hostcontextchanged', () => {
  const context = app.getHostContext();
  style(context);
  draw(context);
});

draw(undefined);
void app.connect().then(() => {
  const context = app.getHostContext();
  style(context);
  draw(context);
});

function readConfig(): { publisher: string } {
  try {
    const raw = document.getElementById('card-view-config')?.textContent ?? '{}';
    const parsed = JSON.parse(raw) as { publisher?: unknown };
    return { publisher: typeof parsed.publisher === 'string' ? parsed.publisher : 'the publisher' };
  } catch {
    return { publisher: 'the publisher' };
  }
}
