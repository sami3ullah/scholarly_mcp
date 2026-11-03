import { describe, expect, it } from 'vitest';
import { formatPublished } from './format-published';
import { isPrefetch } from './is-prefetch';
import { landingHref } from './landing-href';
import { parseLandingParams } from './landing-params';
import { shouldCountVisit } from './should-count-visit';

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

describe('parseLandingParams', () => {
  it('reads token, DOI and the tool from utm_campaign', () => {
    expect(
      parseLandingParams({
        t: 'pSSYWKV6y282qdANYe86LA',
        doi: '10.1055/A-2646-5752',
        utm_campaign: 'search_articles',
        utm_source: 'mcp',
      }),
    ).toEqual({
      token: 'pSSYWKV6y282qdANYe86LA',
      doi: '10.1055/a-2646-5752',
      campaign: 'search_articles',
    });
  });

  it('drops malformed parts instead of refusing the link', () => {
    expect(parseLandingParams({ t: 'short', doi: 'banana', utm_campaign: 'newsletter' })).toEqual(
      {},
    );
  });

  it('takes the first of repeated parameters', () => {
    expect(parseLandingParams({ doi: ['10.1055/a-1', '10.1055/a-2'] })).toEqual({
      doi: '10.1055/a-1',
    });
  });
});

describe('landingHref', () => {
  it('keeps the token for another result of the same search, without UTM tags', () => {
    const href = landingHref({ token: 'pSSYWKV6y282qdANYe86LA' as never, doi: '10.1055/a-1' });
    expect(href).toBe('/mcp/landing?t=pSSYWKV6y282qdANYe86LA&doi=10.1055%2Fa-1');
  });

  it('opens an article by DOI alone without a token', () => {
    expect(landingHref({ doi: '10.1055/a-1&x=1' })).toBe('/mcp/landing?doi=10.1055%2Fa-1%26x%3D1');
  });
});

describe('formatPublished', () => {
  it.each([
    [{ year: 2024 }, 'en', '2024'],
    [{ year: 2025, month: 9 }, 'en', 'September 2025'],
    [{ year: 2025, month: 9, day: 1 }, 'de', '1. September 2025'],
  ])('formats %j in %s as %s', (date, language, expected) => {
    expect(formatPublished(date, language)).toBe(expected);
  });
});

describe('isPrefetch', () => {
  const headers = (values: Record<string, string>) => new Headers(values);

  it('lets a normal browser through', () => {
    expect(isPrefetch(headers({ 'user-agent': CHROME }))).toBe(false);
  });

  it.each([
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'facebookexternalhit/1.1',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'WhatsApp/2.23.20.0',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (Windows NT 10.0) SkypeUriPreview Preview/0.5',
    'Mozilla/5.0 (compatible; Googlebot/2.1)',
    'Mozilla/5.0 HeadlessChrome/141.0.0.0',
    'curl/8.7.1',
  ])('stops the preview agent %s', (agent) => {
    expect(isPrefetch(headers({ 'user-agent': agent }))).toBe(true);
  });

  it.each([
    ['sec-purpose', 'prefetch'],
    ['sec-purpose', 'prefetch;prerender'],
    ['purpose', 'prefetch'],
    ['x-moz', 'prefetch'],
  ])('stops a request with %s: %s', (name, value) => {
    expect(isPrefetch(headers({ 'user-agent': CHROME, [name]: value }))).toBe(true);
  });

  it('stops a request without a user agent', () => {
    expect(isPrefetch(headers({}))).toBe(true);
  });
});

describe('shouldCountVisit', () => {
  it('counts a same-origin beacon from a browser', () => {
    const headers = new Headers({ 'user-agent': CHROME, 'sec-fetch-site': 'same-origin' });
    expect(shouldCountVisit(headers)).toBe(true);
  });

  it('never counts a beacon posted from another site', () => {
    const headers = new Headers({ 'user-agent': CHROME, 'sec-fetch-site': 'cross-site' });
    expect(shouldCountVisit(headers)).toBe(false);
  });

  it('trusts the user agent alone when the browser sends no fetch metadata', () => {
    expect(shouldCountVisit(new Headers({ 'user-agent': CHROME }))).toBe(true);
  });
});
