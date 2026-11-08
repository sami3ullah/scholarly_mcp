import type { Doi } from '../article/doi.js';
import type { Language } from '../article/language.js';
import { detectLanguage } from '../text/detect-language.js';
import type { Chunk, ChunkOrigin, ChunkSource } from './chunk.js';
import { splitSentences } from './split-sentences.js';

/** Counts a text's model tokens, without special tokens. The embedder provides it. */
export type CountTokens = (text: string) => number;

/** A structural unit of an article: an abstract section or a full-text section. */
export interface ChunkSection {
  readonly label?: string;
  readonly paragraphs: readonly string[];
  readonly origin: ChunkOrigin;
  readonly source: ChunkSource;
  /** Required for full text, so its chunks can be purged by licence (ADR 0003). */
  readonly licenseUrl?: string;
}

/** What the chunker needs to know about an article. */
export interface ChunkableDocument {
  readonly doi: Doi;
  readonly title: string;
  /** The article's declared language, used only where a paragraph's own is unclear. */
  readonly language?: Language;
  readonly sections: readonly ChunkSection[];
}

export interface ChunkingOptions {
  readonly countTokens: CountTokens;
  /** Hard limit per chunk; the model reads 512 tokens, which leaves room for the title. */
  readonly maxTokens?: number;
  /** A chunk this long may end at a paragraph break instead of splitting the next one. */
  readonly minTokens?: number;
  /** How many trailing sentences a chunk repeats from the one before it. */
  readonly overlapSentences?: number;
  /** Cap on the repeated text, so a long sentence does not crowd out new text. */
  readonly overlapMaxTokens?: number;
}

/** A chunk before embedding. */
export type ChunkDraft = Omit<Chunk, 'embedding' | 'modelVersion'> & {
  /** The text to embed: the chunk with the article title in front, so short chunks keep context. */
  readonly embeddingText: string;
  /** Characters at the start of `text` repeated from the previous chunk. */
  readonly overlapLength: number;
};

/**
 * The text a chunk is embedded from: its own text with the article title in front, except a
 * `metadata` chunk, which already is the title. A re-embedding with another model rebuilds
 * it from a stored chunk (ADR 0028).
 */
export function embeddingTextOf(title: string, chunk: Pick<Chunk, 'origin' | 'text'>): string {
  return chunk.origin === 'metadata' ? chunk.text : `${title}\n\n${chunk.text}`;
}

export const DEFAULT_CHUNKING = {
  maxTokens: 400,
  minTokens: 200,
  overlapSentences: 2,
  overlapMaxTokens: 100,
} as const;

/** A sentence, or a piece of one too long for a chunk. */
interface Unit {
  readonly text: string;
  readonly tokens: number;
  /** Index of the unit's paragraph within its run, to join with the right separator. */
  readonly paragraph: number;
  /** Tokens from this unit to the end of its paragraph, including itself. */
  readonly paragraphTokensLeft: number;
}

interface Run {
  readonly section: ChunkSection;
  readonly language: Language | undefined;
  readonly paragraphs: readonly string[];
}

type Settings = Required<ChunkingOptions>;

/**
 * Splits an article into chunks (ARCHITECTURE.md "Chunking"). Sections are hard boundaries, and so
 * is a change of language between paragraphs, so every chunk has one section and one
 * language. Within that, paragraphs and then sentences are packed into balanced chunks of at
 * most `maxTokens`; a sentence that alone is too long is split between words. A chunk split
 * inside a section repeats up to `overlapSentences` trailing sentences of the one before.
 */
export function chunkDocument(document: ChunkableDocument, options: ChunkingOptions): ChunkDraft[] {
  const settings: Settings = { ...DEFAULT_CHUNKING, ...options };
  const drafts: ChunkDraft[] = [];
  for (const run of languageRuns(document)) {
    const units = run.paragraphs.flatMap((paragraph, index) =>
      paragraphUnits(paragraph, index, run.language, settings),
    );
    for (const { overlap, fresh } of pack(units, settings)) {
      drafts.push(toDraft(document, run, overlap, fresh, drafts.length, settings));
    }
  }
  return drafts;
}

/**
 * Detects each paragraph's language. An unclear paragraph takes the language of its nearest
 * clear neighbour before the article's declared one, because publishers sometimes declare
 * German for an English abstract.
 */
function languageRuns(document: ChunkableDocument): Run[] {
  const paragraphs = document.sections.flatMap((section) =>
    section.paragraphs
      .map((text) => text.trim())
      .filter((text) => text !== '')
      .map((text) => ({ section, text, detected: detectLanguage(text) })),
  );
  const resolved = paragraphs.map((paragraph, index) => {
    if (paragraph.detected !== undefined) return paragraph.detected;
    const before = paragraphs.slice(0, index).findLast((other) => other.detected !== undefined);
    const after = paragraphs.slice(index + 1).find((other) => other.detected !== undefined);
    return before?.detected ?? after?.detected ?? document.language;
  });

  const runs: { section: ChunkSection; language: Language | undefined; paragraphs: string[] }[] =
    [];
  for (const [index, { section, text }] of paragraphs.entries()) {
    const language = resolved[index];
    const current = runs.at(-1);
    if (current?.section === section && current.language === language)
      current.paragraphs.push(text);
    else runs.push({ section, language, paragraphs: [text] });
  }
  return runs;
}

function paragraphUnits(
  paragraph: string,
  index: number,
  language: Language | undefined,
  settings: Settings,
): Unit[] {
  const pieces = splitSentences(paragraph, language ?? 'en')
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')
    .flatMap((sentence) => {
      const tokens = settings.countTokens(sentence);
      return tokens <= settings.maxTokens
        ? [{ text: sentence, tokens }]
        : splitWords(sentence, settings);
    });
  let left = pieces.reduce((sum, piece) => sum + piece.tokens, 0);
  return pieces.map((piece) => {
    const unit = { ...piece, paragraph: index, paragraphTokensLeft: left };
    left -= piece.tokens;
    return unit;
  });
}

/**
 * Splits an over-long sentence into pieces of at most `maxTokens`, between words. A single
 * word longer than that stays whole; the embedder truncates it.
 */
function splitWords(sentence: string, settings: Settings): { text: string; tokens: number }[] {
  const pieces: { text: string; tokens: number }[] = [];
  let words: string[] = [];
  for (const word of sentence.split(/\s+/)) {
    const candidate = [...words, word].join(' ');
    if (words.length > 0 && settings.countTokens(candidate) > settings.maxTokens) {
      const text = words.join(' ');
      pieces.push({ text, tokens: settings.countTokens(text) });
      words = [word];
    } else {
      words.push(word);
    }
  }
  const text = words.join(' ');
  pieces.push({ text, tokens: settings.countTokens(text) });
  return pieces;
}

/**
 * Packs units greedily into chunks near an even share of the run, so a run of 450 tokens
 * becomes two chunks of about 225, not 400 and 50. Overlap is not counted in the share, so
 * a run can end up one chunk longer.
 */
function pack(units: readonly Unit[], settings: Settings): { overlap: Unit[]; fresh: Unit[] }[] {
  const total = units.reduce((sum, unit) => sum + unit.tokens, 0);
  const target = total / Math.max(1, Math.ceil(total / settings.maxTokens));
  const chunks: { overlap: Unit[]; fresh: Unit[] }[] = [];
  let overlap: Unit[] = [];
  let fresh: Unit[] = [];
  let tokens = 0;

  for (const unit of units) {
    const paragraphFits = tokens + unit.paragraphTokensLeft <= settings.maxTokens;
    const startsParagraph = unit.paragraph !== fresh.at(-1)?.paragraph;
    // Prefer paragraph breaks: past its target, a chunk still finishes a paragraph that fits.
    const full =
      tokens + unit.tokens > settings.maxTokens ||
      (startsParagraph
        ? tokens >= target || (tokens >= settings.minTokens && !paragraphFits)
        : tokens >= target && !paragraphFits);
    if (fresh.length > 0 && full) {
      chunks.push({ overlap, fresh });
      overlap = overlapFor([...overlap, ...fresh], unit, settings);
      fresh = [];
      tokens = overlap.reduce((sum, carried) => sum + carried.tokens, 0);
    }
    fresh.push(unit);
    tokens += unit.tokens;
  }
  if (fresh.length > 0) chunks.push({ overlap, fresh });
  return chunks;
}

/** The trailing sentences to repeat, within the overlap cap and leaving room for `next`. */
function overlapFor(previous: readonly Unit[], next: Unit, settings: Settings): Unit[] {
  const carried: Unit[] = [];
  let tokens = 0;
  for (const unit of previous.toReversed().slice(0, settings.overlapSentences)) {
    tokens += unit.tokens;
    if (tokens > settings.overlapMaxTokens || tokens + next.tokens > settings.maxTokens) break;
    carried.unshift(unit);
  }
  return carried;
}

function joinUnits(units: readonly Unit[]): string {
  return units
    .map((unit, index) => {
      if (index === 0) return unit.text;
      const separator = unit.paragraph === units[index - 1]?.paragraph ? ' ' : '\n\n';
      return separator + unit.text;
    })
    .join('');
}

function toDraft(
  document: ChunkableDocument,
  run: Run,
  overlap: readonly Unit[],
  fresh: readonly Unit[],
  ordinal: number,
  settings: Settings,
): ChunkDraft {
  const { section, language } = run;
  const text = joinUnits([...overlap, ...fresh]);
  const freshText = joinUnits(fresh);
  return {
    id: `${document.doi}#${String(ordinal)}`,
    doi: document.doi,
    ordinal,
    ...(section.label !== undefined && { section: section.label }),
    text,
    ...(language !== undefined && { language }),
    tokenCount: Math.max(1, settings.countTokens(text)),
    origin: section.origin,
    source: section.source,
    ...(section.licenseUrl !== undefined && { licenseUrl: section.licenseUrl }),
    embeddingText: embeddingTextOf(document.title, { origin: section.origin, text }),
    overlapLength: text.length - freshText.length,
  };
}
