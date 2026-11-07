import type { ArticleCard } from '@scholarly-mcp/core';
import type { Labels } from './labels.js';

/** What `search_articles` puts in `structuredContent` that the view shows. */
export interface CardList {
  readonly cards: readonly ArticleCard[];
  readonly collectionUrl?: string;
}

export interface RenderOptions {
  readonly labels: Labels;
  readonly publisher: string;
  /** Opens a landing link through the host. */
  readonly open: (url: string) => void;
}

/**
 * Reads the card list out of a tool result's structured content. Anything that does not look
 * like cards gives an empty list, so a malformed result shows "no articles" instead of
 * breaking the view. Card text is data: it is only ever set as text, never as HTML.
 */
export function cardListOf(structured: unknown): CardList {
  if (typeof structured !== 'object' || structured === null) return { cards: [] };
  const { cards, collectionUrl } = structured as { cards?: unknown; collectionUrl?: unknown };
  const list = Array.isArray(cards) ? cards.filter(isCard) : [];
  return {
    cards: list,
    ...(typeof collectionUrl === 'string' && isWebUrl(collectionUrl) && { collectionUrl }),
  };
}

/** Replaces the root's content with the cards (PLAN.md tool contracts: MCP Apps). */
export function renderCards(root: HTMLElement, list: CardList, options: RenderOptions): void {
  const doc = root.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const link = (url: string, className: string, text: string, icon?: Icon) => {
    const anchor = el('a', className);
    if (icon === undefined) anchor.textContent = text;
    else anchor.append(el('span', undefined, text), iconOf(doc, icon));
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      options.open(url);
    });
    return anchor;
  };

  root.replaceChildren();
  if (list.cards.length === 0) {
    root.append(el('p', 'empty', options.labels.noResults));
    return;
  }
  const items = el('ol', 'cards');
  for (const card of list.cards) {
    const item = el('li', 'card');
    const title = el('h3', 'title');
    title.append(link(card.url, 'title-link', card.title));
    const meta = el('p', 'meta');
    meta.append(
      el('span', 'journal', card.journal),
      doc.createTextNode(` · ${String(card.year)}`),
      ...(card.firstAuthor === undefined ? [] : [doc.createTextNode(` · ${card.firstAuthor}`)]),
    );
    const footer = el('div', 'card-footer');
    const badge = el('span', `badge badge-${card.access}`);
    if (card.access === 'subscription') badge.append(iconOf(doc, 'lock'));
    badge.append(doc.createTextNode(accessLabel(card.access, options.labels)));
    footer.append(
      badge,
      link(card.url, 'read', options.labels.read(options.publisher), 'external'),
    );
    item.append(title, meta);
    if (card.teaser !== '') item.append(el('p', 'teaser', card.teaser));
    item.append(footer);
    items.append(item);
  }
  root.append(items);
  if (list.collectionUrl !== undefined) {
    root.append(link(list.collectionUrl, 'all', options.labels.allResults, 'external'));
  }
}

type Icon = 'external' | 'lock';

/** Fixed, decorative icons; drawn from constants, never from card data. */
const ICON_PATHS: Readonly<Record<Icon, readonly string[]>> = {
  external: ['M4.5 11.5l7-7', 'M5.5 4.5h6v6'],
  lock: ['M4 7.5h8v6H4z', 'M5.75 7.5V5.25a2.25 2.25 0 0 1 4.5 0V7.5'],
};

function iconOf(doc: Document, icon: Icon): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of ICON_PATHS[icon]) {
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function accessLabel(access: ArticleCard['access'], labels: Labels): string {
  switch (access) {
    case 'open':
      return labels.openAccess;
    case 'subscription':
      return labels.subscription;
    case 'unknown':
      return labels.unknownAccess;
  }
}

function isCard(value: unknown): value is ArticleCard {
  if (typeof value !== 'object' || value === null) return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card['title'] === 'string' &&
    typeof card['journal'] === 'string' &&
    typeof card['year'] === 'number' &&
    typeof card['teaser'] === 'string' &&
    typeof card['url'] === 'string' &&
    isWebUrl(card['url']) &&
    (card['access'] === 'open' ||
      card['access'] === 'subscription' ||
      card['access'] === 'unknown') &&
    (card['firstAuthor'] === undefined || typeof card['firstAuthor'] === 'string')
  );
}

/** Only http(s) links are opened, so a card can never carry a `javascript:` URL. */
function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
