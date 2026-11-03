import { anArticle } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { landingTopics } from './landing-topics.js';

const article = (...labels: [string, 'mesh' | 'keyword' | 'journal'][]) =>
  anArticle()
    .withSubjects(...labels.map(([label, origin]) => ({ label, origin })))
    .build();

describe('landingTopics', () => {
  it('puts labels shared by most results first', () => {
    const topics = landingTopics(article(['Stroke', 'mesh'], ['Heart', 'mesh']), [
      article(['heart', 'keyword'], ['Stroke', 'mesh']),
      article(['Heart', 'mesh']),
    ]);
    expect(topics).toEqual(['Heart', 'Stroke']);
  });

  it("uses the chosen article's labels when no label is shared", () => {
    const topics = landingTopics(
      article(['A', 'mesh'], ['B', 'keyword'], ['C', 'mesh'], ['D', 'mesh']),
      [article(['E', 'mesh'])],
    );
    expect(topics).toEqual(['A', 'B', 'C']);
  });

  it('uses journal-level subjects only when an article has nothing more specific', () => {
    expect(landingTopics(article(['Medicine', 'journal'], ['Sepsis', 'mesh']), [])).toEqual([
      'Sepsis',
    ]);
    expect(landingTopics(article(['Medicine', 'journal']), [])).toEqual(['Medicine']);
  });

  it('has no topic without subjects', () => {
    expect(landingTopics(article(), [article()])).toEqual([]);
  });
});
