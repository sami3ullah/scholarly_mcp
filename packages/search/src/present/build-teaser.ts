import {
  TEASER_MAX_LENGTH,
  parseAbstract,
  splitSentences,
  type Article,
} from '@scholarly-mcp/core';
import { cutAtWord } from './cut-at-word.js';

/** Section labels that hold the abstract's conclusion, in German or English. */
const CONCLUSION_LABEL = /conclusion|schlussfolgerung|fazit|interpretation|take.home/i;
/** Sentences that open a conclusion in an abstract without section labels. */
const CONCLUSION_LEAD = /^(?:in conclusion|in summary|to conclude|zusammenfassend|abschließend)\b/i;
/** A question this short opening the abstract is a box heading, such as DMW's "Was ist neu?". */
const HEADING_MAX_WORDS = 4;

/**
 * Builds a card's teaser from the abstract: the first sentence of its conclusion section, or
 * of a sentence opening a conclusion, else its first sentence; cut at a word boundary to 280
 * characters. Empty when there is no abstract, because nothing is ever invented (ARCHITECTURE.md
 * "The article card").
 */
export function buildTeaser(article: Pick<Article, 'abstract' | 'language'>): string {
  if (article.abstract === undefined) return '';
  const locale = article.language ?? 'en';
  const sections = parseAbstract(article.abstract);
  const conclusion = sections.find(
    ({ label }) => label !== undefined && CONCLUSION_LABEL.test(label),
  );
  const sentences = (paragraphs: readonly string[]) => splitSentences(paragraphs.join(' '), locale);

  const sentence =
    conclusion === undefined
      ? pickSentence(sentences(sections.flatMap(({ paragraphs }) => paragraphs)))
      : sentences(conclusion.paragraphs)[0];
  return cutAtWord(sentence ?? '', TEASER_MAX_LENGTH);
}

function pickSentence(sentences: readonly string[]): string | undefined {
  const [first, ...rest] = sentences;
  const body = first !== undefined && rest.length > 0 && isHeading(first) ? rest : sentences;
  return body.find((sentence) => CONCLUSION_LEAD.test(sentence)) ?? body[0];
}

function isHeading(sentence: string): boolean {
  const text = sentence.trim();
  return text.endsWith('?') && text.split(/\s+/).length <= HEADING_MAX_WORDS;
}
