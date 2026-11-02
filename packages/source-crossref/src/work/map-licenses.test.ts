import { describe, expect, it } from 'vitest';
import { aCrossrefWork } from '../testing/a-crossref-work.js';
import { isOpenLicense, mapLicenses } from './map-licenses.js';

const start = { 'date-time': '2024-01-02T00:00:00Z' };

function licensesOf(...entries: { URL: string; 'content-version': string }[]) {
  return mapLicenses(aCrossrefWork({ license: entries.map((entry) => ({ ...entry, start })) }));
}

describe('mapLicenses', () => {
  it('maps url, content version and start date', () => {
    expect(
      licensesOf({ URL: 'https://creativecommons.org/licenses/by/4.0/', 'content-version': 'vor' }),
    ).toEqual([
      {
        url: 'https://creativecommons.org/licenses/by/4.0/',
        contentVersion: 'vor',
        start: new Date('2024-01-02T00:00:00Z'),
      },
    ]);
  });

  it.each([
    'http://creativecommons.org/licenses/by-nc-nd/4.0',
    'https://www.creativecommons.org/licenses/BY-NC-ND/4.0/',
    ' https://creativecommons.org/licenses/by-nc-nd/4.0/ ',
  ])('canonicalises the Creative Commons spelling %s', (URL) => {
    expect(licensesOf({ URL, 'content-version': 'vor' })[0]?.url).toBe(
      'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    );
  });

  it('keeps other licence URLs as deposited', () => {
    const URL = 'https://www.thieme.de/de/thieme-connect/TDM.htm';
    expect(licensesOf({ URL, 'content-version': 'tdm' })[0]?.url).toBe(URL);
  });

  it('maps an unknown content version to unspecified', () => {
    const [license] = licensesOf({ URL: 'https://example.org/l', 'content-version': 'proof' });
    expect(license?.contentVersion).toBe('unspecified');
  });

  it.each(['not a url', 'ftp://example.org/licence', ''])('drops the unusable URL "%s"', (URL) => {
    expect(licensesOf({ URL, 'content-version': 'vor' })).toEqual([]);
  });

  it('returns nothing when the work has no licence', () => {
    expect(mapLicenses(aCrossrefWork({ license: undefined }))).toEqual([]);
  });
});

describe('isOpenLicense', () => {
  it('is true for Creative Commons and false for publisher licences', () => {
    const license = { contentVersion: 'vor' as const, start: new Date(0) };
    expect(isOpenLicense({ ...license, url: 'https://creativecommons.org/licenses/by/4.0/' })).toBe(
      true,
    );
    expect(isOpenLicense({ ...license, url: 'https://www.thieme.de/tdm' })).toBe(false);
  });
});
