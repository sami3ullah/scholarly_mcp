import { describe, expect, it } from 'vitest';
import { activeLicense } from './active-license.js';
import type { License } from './license.js';

const now = new Date('2026-11-02T00:00:00Z');
const ccBy = 'https://creativecommons.org/licenses/by/4.0/';
const ccByNcNd = 'https://creativecommons.org/licenses/by-nc-nd/4.0/';
const tdm = 'https://www.thieme.de/de/thieme-connect/tdm.htm';

function license(url: string, contentVersion: License['contentVersion'], start: string): License {
  return { url, contentVersion, start: new Date(start) };
}

describe('activeLicense', () => {
  it('returns the version-of-record licence when it has started', () => {
    const vor = license(ccBy, 'vor', '2024-01-01T00:00:00Z');
    expect(activeLicense([license(tdm, 'tdm', '2024-01-01T00:00:00Z'), vor], now)).toBe(vor);
  });

  it('treats a future start date as an embargo and returns nothing', () => {
    expect(activeLicense([license(ccBy, 'vor', '2027-01-01T00:00:00Z')], now)).toBeUndefined();
  });

  it('opens on the start instant itself', () => {
    expect(activeLicense([license(ccBy, 'vor', now.toISOString())], now)?.url).toBe(ccBy);
  });

  it('returns nothing when only non-version-of-record licences exist', () => {
    const licenses = [
      license(ccBy, 'am', '2024-01-01T00:00:00Z'),
      license(tdm, 'tdm', '2024-01-01T00:00:00Z'),
    ];
    expect(activeLicense(licenses, now)).toBeUndefined();
  });

  it('returns nothing when there are no licences', () => {
    expect(activeLicense([], now)).toBeUndefined();
  });

  it('picks the most recently started version-of-record licence in force', () => {
    const licenses = [
      license(ccByNcNd, 'vor', '2024-01-01T00:00:00Z'),
      license(ccBy, 'vor', '2025-06-01T00:00:00Z'),
      license(tdm, 'vor', '2027-01-01T00:00:00Z'),
    ];
    expect(activeLicense(licenses, now)?.url).toBe(ccBy);
  });
});
