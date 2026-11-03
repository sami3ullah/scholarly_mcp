import { build } from 'esbuild';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CARD_VIEW_URI, cardViewHtml } from './index.js';

const card = (n: number, access = 'open') => ({
  doi: `10.1055/a-100${String(n)}`,
  title: `Article ${String(n)}`,
  journal: 'Pneumologie',
  year: 2024,
  teaser: `Teaser ${String(n)}`,
  whyMatched: 'matched',
  access,
  license: 'unknown',
  url: `https://landing.example/mcp/landing?t=AAAAAAAAAAAAAAAAAAAAAA&doi=10.1055%2Fa-100${String(n)}`,
});

describe('cardViewHtml', () => {
  it('is one self-contained page that loads nothing from elsewhere', () => {
    const html = cardViewHtml({ publisher: 'Thieme' });
    expect(CARD_VIEW_URI).toBe('ui://scholarly-mcp/cards.html');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import/);
    expect(html).toContain('{"publisher":"Thieme"}');
  });

  it('cannot be broken out of by the publisher name', () => {
    const html = cardViewHtml({ publisher: '</script><script>alert(1)</script>' });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });
});

describe('the card view in an MCP Apps host', () => {
  let browser: Browser;
  let hostScript: string;

  beforeAll(async () => {
    browser = await chromium.launch();
    const bundle = await build({
      entryPoints: [new URL('./view/testing/host.ts', import.meta.url).pathname],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      write: false,
      logLevel: 'error',
    });
    hostScript = bundle.outputFiles[0]?.text ?? '';
  }, 60_000);

  afterAll(async () => {
    await browser.close();
  });

  async function hostPage() {
    const page = await browser.newPage();
    const view = cardViewHtml({ publisher: 'Thieme' })
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;');
    await page.setContent(
      `<!doctype html><html><body><iframe id="view" sandbox="allow-scripts" srcdoc="${view}" style="width:600px;height:800px"></iframe><script>${hostScript.replaceAll('</script', '<\\/script')}</script></body></html>`,
    );
    await page.evaluate(() => (globalThis as unknown as { ready: Promise<void> }).ready);
    return { page, frame: page.frameLocator('#view') };
  }

  it('renders the cards a tool result carries and opens links through the host', async () => {
    const { page, frame } = await hostPage();
    await page.evaluate(
      (cards) =>
        (globalThis as unknown as { sendResult: (s: unknown) => Promise<void> }).sendResult({
          cards,
          collectionUrl: 'https://landing.example/mcp/landing?t=AAAAAAAAAAAAAAAAAAAAAA',
        }),
      [card(1), card(2, 'subscription')],
    );
    await expect.poll(() => frame.locator('.card').count()).toBe(2);
    expect(await frame.locator('.title').allTextContents()).toEqual(['Article 1', 'Article 2']);
    expect(await frame.locator('.badge').allTextContents()).toEqual([
      'Open access',
      'Subscription',
    ]);
    await frame.locator('.read').first().click();
    await expect
      .poll(() => page.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))
      .toEqual([card(1).url]);
    await page.close();
  }, 30_000);

  it('follows the host locale', async () => {
    const { page, frame } = await hostPage();
    await page.evaluate(() =>
      (globalThis as unknown as { setLocale: (l: string) => Promise<void> }).setLocale('de-DE'),
    );
    await page.evaluate(
      (cards) =>
        (globalThis as unknown as { sendResult: (s: unknown) => Promise<void> }).sendResult({
          cards,
        }),
      [card(1)],
    );
    await expect.poll(() => frame.locator('.read').textContent()).toBe('Bei Thieme lesen');
    await page.close();
  }, 30_000);
});
