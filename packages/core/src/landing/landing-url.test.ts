import { describe, expect, it } from 'vitest';
import { doiSchema } from '../article/doi.js';
import { buildLandingUrl } from './landing-url.js';
import { tokenSchema } from './token.js';

const token = tokenSchema.parse('AAAAAAAAAAAAAAAAAAAAAA');
const doi = doiSchema.parse('10.1055/a-2245-1234');

describe('buildLandingUrl', () => {
  it('carries token, DOI and UTM tags naming the tool', () => {
    const url = new URL(
      buildLandingUrl({ baseUrl: 'https://example.org', tool: 'search_articles', token, doi }),
    );
    expect(url.pathname).toBe('/mcp/landing');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      t: token,
      doi,
      utm_source: 'mcp',
      utm_medium: 'ai',
      utm_campaign: 'search_articles',
    });
  });

  it('leaves the DOI out of the collection link', () => {
    const url = buildLandingUrl({ baseUrl: 'https://example.org', tool: 'find_related', token });
    expect(new URL(url).searchParams.has('doi')).toBe(false);
  });

  it('falls back to the DOI alone when no session could be stored', () => {
    const url = buildLandingUrl({ baseUrl: 'https://example.org', tool: 'get_article', doi });
    expect(new URL(url).searchParams.has('t')).toBe(false);
  });

  it.each(['https://example.org/thieme', 'https://example.org/thieme/'])(
    'keeps the base path of %s',
    (baseUrl) => {
      expect(new URL(buildLandingUrl({ baseUrl, tool: 'cite', doi })).pathname).toBe(
        '/thieme/mcp/landing',
      );
    },
  );

  it('encodes DOIs with reserved characters', () => {
    const odd = doiSchema.parse('10.1016/s0140-6736(20)30183-5&x=1');
    const url = new URL(
      buildLandingUrl({ baseUrl: 'https://example.org', tool: 'cite', doi: odd }),
    );
    expect(url.searchParams.get('doi')).toBe(odd);
    expect(url.searchParams.has('x')).toBe(false);
  });
});
