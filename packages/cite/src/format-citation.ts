import { readFileSync } from 'node:fs';
import { Cite, plugins } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import '@citation-js/plugin-ris';
import type { Article } from '@scholarly-mcp/core';
import type { CitationStyle } from './citation-style.js';
import { toCslItem } from './to-csl-item.js';

/** A RIS line starts with a two-character tag, two spaces and a dash. */
const RIS_TAG = /^[A-Z][A-Z0-9] {2}-/;

/**
 * citation-js wraps RIS values at 70 characters, which splits URLs across lines. Reference
 * managers (Zotero, EndNote, Mendeley) read long lines, so continuation lines are joined back.
 */
function unwrapRis(ris: string): string {
  const lines: string[] = [];
  for (const line of ris.split('\n')) {
    if (RIS_TAG.test(line) || lines.length === 0) lines.push(line);
    else lines[lines.length - 1] = `${lines.at(-1) ?? ''}${line}`;
  }
  return lines.join('\n');
}

/** The CSL style registered for AMA; APA and Vancouver ship with plugin-csl. */
const AMA = 'american-medical-association';

interface CslConfig {
  readonly styles: { has(name: string): boolean; add(name: string, xml: string): void };
}

/** Registers the vendored AMA style once; the file sits next to `src` and `dist`. */
function registerStyles(): void {
  const csl = plugins.config.get('@csl') as CslConfig;
  if (csl.styles.has(AMA)) return;
  const xml = readFileSync(new URL(`../styles/${AMA}.csl`, import.meta.url), 'utf8');
  csl.styles.add(AMA, xml);
}

const CSL_STYLES = { vancouver: 'vancouver', apa: 'apa', ama: AMA } as const;

/**
 * Formats one article's citation with CSL (APA, Vancouver, AMA, in US English) or as a
 * BibTeX or RIS record. The numeric styles' list number ("1. ") is dropped, since a single
 * citation is not a numbered list. Same article in, same text out (snapshot-tested).
 */
export function formatCitation(article: Article, style: CitationStyle): string {
  registerStyles();
  const cite = new Cite([toCslItem(article)]);
  if (style === 'bibtex') return String(cite.format('bibtex')).trim();
  if (style === 'ris') return unwrapRis(String(cite.format('ris')).trim());
  const text = String(
    cite.format('bibliography', { format: 'text', style: CSL_STYLES[style], lang: 'en-US' }),
  );
  return text.trim().replace(/^\d+\.\s+/, '');
}
