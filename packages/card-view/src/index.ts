import { readFileSync } from 'node:fs';

/** The URI the server registers the card view under (ADR 0033). */
export const CARD_VIEW_URI = 'ui://scholarly-mcp/cards.html';

const CONFIG_SLOT = '__CARD_VIEW_CONFIG__';

let template: string | undefined;

/**
 * The card view as one self-contained HTML page, with the publisher's name for its "Read on"
 * button. The page is built into `dist/` by `scripts/build-view.mjs`; the path also resolves
 * from `src/`, so tests run against the built page.
 */
export function cardViewHtml(options: { readonly publisher: string }): string {
  template ??= readFileSync(new URL('../dist/card-view.html', import.meta.url), 'utf8');
  // `<` is escaped, so no value can close the script element it sits in.
  const config = JSON.stringify({ publisher: options.publisher }).replaceAll('<', '\\u003c');
  return template.replace(CONFIG_SLOT, () => config);
}
