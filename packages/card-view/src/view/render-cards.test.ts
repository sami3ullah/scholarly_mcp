// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { labelsFor } from './labels.js';
import { cardListOf, renderCards } from './render-cards.js';

const card = {
  doi: '10.1055/a-1001',
  title: 'Rivaroxaban dosing in atrial fibrillation',
  journal: 'Thrombosis and Haemostasis',
  year: 2025,
  firstAuthor: 'A. Author',
  teaser: 'Lower doses were safe.',
  whyMatched: 'matched in Results',
  access: 'open',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  url: 'https://landing.example/mcp/landing?t=AAAAAAAAAAAAAAAAAAAAAA&doi=10.1055%2Fa-1001',
};

let root: HTMLElement;
const open = vi.fn<(url: string) => void>();
beforeEach(() => {
  document.body.innerHTML = '<main id="cards"></main>';
  root = document.getElementById('cards') as HTMLElement;
  open.mockClear();
});

const render = (structured: unknown, locale = 'en') => {
  renderCards(root, cardListOf(structured), {
    labels: labelsFor(locale),
    publisher: 'Thieme',
    open,
  });
};

describe('the card view', () => {
  it('shows title, journal, year, author, teaser, access badge and the read button', () => {
    render({ cards: [card] });
    const item = root.querySelector('.card');
    expect(item?.querySelector('.title')?.textContent).toBe(card.title);
    expect(item?.querySelector('.meta')?.textContent).toBe(
      'Thrombosis and Haemostasis · 2025 · A. Author',
    );
    expect(item?.querySelector('.teaser')?.textContent).toBe('Lower doses were safe.');
    expect(item?.querySelector('.badge')?.textContent).toBe('Open access');
    expect(item?.querySelector('.read')?.textContent).toBe('Read on Thieme');
    expect(item?.querySelector('.read')?.getAttribute('href')).toBe(card.url);
  });

  it('opens links through the host instead of navigating the frame', () => {
    render({ cards: [card] });
    const read = root.querySelector<HTMLAnchorElement>('.read');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    read?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith(card.url);
  });

  it('speaks German for a German host', () => {
    render({ cards: [{ ...card, access: 'subscription' }] }, 'de-DE');
    expect(root.querySelector('.read')?.textContent).toBe('Bei Thieme lesen');
    expect(root.querySelector('.badge')?.textContent).toBe('Abonnement');
  });

  it('adds the collection link when there is one', () => {
    render({ cards: [card], collectionUrl: 'https://landing.example/mcp/landing?t=x' });
    const all = root.querySelector<HTMLAnchorElement>('.all');
    expect(all?.textContent).toBe('All results on one page');
    all?.click();
    expect(open).toHaveBeenCalledWith('https://landing.example/mcp/landing?t=x');
  });

  it('treats card text as text, never as HTML', () => {
    render({ cards: [{ ...card, title: '<img src=x onerror=alert(1)>' }] });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.title')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it.each([
    ['no structured content', undefined],
    ['no cards', { cards: [] }],
    ['malformed cards', { cards: [{ title: 1 }, 'x'] }],
    ['a javascript: link', { cards: [{ ...card, url: 'javascript:alert(1)' }] }],
  ])('says nothing matched for %s', (_case, structured) => {
    render(structured);
    expect(root.textContent).toBe('No articles matched.');
    expect(root.querySelector('a')).toBeNull();
  });

  it('drops a collection link that is not http(s)', () => {
    expect(cardListOf({ cards: [card], collectionUrl: 'javascript:x' })).not.toHaveProperty(
      'collectionUrl',
    );
  });

  it('leaves the badge text but no teaser paragraph for an empty teaser', () => {
    render({ cards: [{ ...card, teaser: '', firstAuthor: undefined, access: 'unknown' }] });
    expect(root.querySelector('.teaser')).toBeNull();
    expect(root.querySelector('.meta')?.textContent).toBe('Thrombosis and Haemostasis · 2025');
    expect(root.querySelector('.badge')?.textContent).toBe('Access unknown');
  });
});
