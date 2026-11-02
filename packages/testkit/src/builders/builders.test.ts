import { isDisplayable } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../fakes/fake-clock.js';
import { createSequentialTokens } from '../fakes/sequential-tokens.js';
import { aChunk } from './a-chunk.js';
import { aLandingSession } from './a-landing-session.js';
import { anArticle } from './an-article.js';

describe('anArticle', () => {
  it('builds a title-only article without inventing an abstract', () => {
    expect(anArticle().withoutAbstract().build()).not.toHaveProperty('abstract');
  });

  it('keeps year-only precision', () => {
    expect(anArticle().publishedIn(2024).build().published).toEqual({ year: 2024 });
  });

  it('does not change the builder it was derived from', () => {
    const base = anArticle();
    base.retracted();
    expect(base.build().isRetracted).toBe(false);
  });

  it('normalises the DOI it is given', () => {
    expect(anArticle().withDoi('10.1055/A-9').build().doi).toBe('10.1055/a-9');
  });
});

describe('aChunk', () => {
  it('builds full-text chunks that record their licence and are never displayable', () => {
    const chunk = aChunk().fromFullText('https://creativecommons.org/licenses/by/4.0/').build();
    expect(chunk.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(isDisplayable(chunk)).toBe(false);
  });

  it('derives the id from DOI and ordinal', () => {
    expect(aChunk().of('10.1055/a-9', 3).build().id).toBe('10.1055/a-9#3');
  });
});

describe('aLandingSession', () => {
  it('expires 24 hours after creation', () => {
    const session = aLandingSession().createdAt(new Date('2026-11-02T00:00:00Z')).build();
    expect(session.expiresAt).toEqual(new Date('2026-11-03T00:00:00Z'));
  });
});

describe('test doubles', () => {
  it('moves the fake clock only when told to', () => {
    const clock = createFakeClock(new Date('2026-11-02T00:00:00Z'));
    clock.advance(1000);
    expect(clock.now()).toEqual(new Date('2026-11-02T00:00:01Z'));
  });

  it('hands out distinct, valid tokens', () => {
    const tokens = createSequentialTokens();
    expect([tokens.next(), tokens.next()]).toEqual([
      '0000000000000000000001',
      '0000000000000000000002',
    ]);
  });
});
