import { describe, expect, it } from 'vitest';
import { europepmcLicenseFamily, licenseFamily, sameLicenseUrl } from './license-family.js';

describe('licence families', () => {
  it.each([
    ['https://creativecommons.org/licenses/by/4.0/', 'by'],
    ['http://creativecommons.org/licenses/by-nc-nd/3.0/deed.de', 'by-nc-nd'],
    ['https://creativecommons.org/publicdomain/zero/1.0/', 'zero'],
    ['https://www.thieme.de/de/autorenlounge/licence.htm', undefined],
  ])('reads %s', (url, family) => {
    expect(licenseFamily(url)).toBe(family);
  });

  it.each([
    ['cc by', 'by'],
    ['CC BY-NC-ND', 'by-nc-nd'],
    ['cc0', 'zero'],
    ['other', undefined],
    [undefined, undefined],
  ])('reads Europe PMC’s %j', (value, family) => {
    expect(europepmcLicenseFamily(value)).toBe(family);
  });

  it('compares URLs ignoring scheme, case and trailing slash', () => {
    expect(
      sameLicenseUrl(
        'http://CreativeCommons.org/licenses/by/4.0',
        'https://creativecommons.org/licenses/by/4.0/',
      ),
    ).toBe(true);
    expect(
      sameLicenseUrl(
        'https://creativecommons.org/licenses/by/4.0/',
        'https://creativecommons.org/licenses/by-nc/4.0/',
      ),
    ).toBe(false);
  });
});
