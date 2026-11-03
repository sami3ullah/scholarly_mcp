import { describe, expect, it } from 'vitest';
import { aCrossrefWork } from '../testing/a-crossref-work.js';
import { mapIssueLocator } from './map-issue-locator.js';

describe('mapIssueLocator', () => {
  it('keeps volume, issue and pages as deposited', () => {
    const work = aCrossrefWork({ volume: '35', issue: 'S 01', page: 'e12-e20' });
    expect(mapIssueLocator(work)).toEqual({ volume: '35', issue: 'S 01', pages: 'e12-e20' });
  });

  it('collapses whitespace and leaves blank values out', () => {
    const work = aCrossrefWork({ volume: ' 35 ', issue: '  ', page: '100 -\n105' });
    expect(mapIssueLocator(work)).toEqual({ volume: '35', pages: '100 - 105' });
  });

  it('returns nothing for an online-first record without a locator', () => {
    expect(mapIssueLocator(aCrossrefWork())).toEqual({});
  });
});
