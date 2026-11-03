import type { Chunk, MatchedPassage } from '@scholarly-mcp/core';

/**
 * Where the search matched the chosen article, from its best chunk (ADR 0032). An abstract
 * chunk is quoted; a metadata chunk is the title, which the page already shows; a full-text
 * chunk names only its section, since full text is never shown (ADR 0003, ADR 0025). Without
 * a chunk there is nothing to say, and the page shows the abstract alone.
 */
export function matchedPassage(chunk: Chunk | undefined): MatchedPassage | undefined {
  if (chunk === undefined) return undefined;
  switch (chunk.origin) {
    case 'abstract':
      return {
        in: 'abstract',
        text: chunk.text,
        ...(chunk.section !== undefined && { section: chunk.section }),
      };
    case 'metadata':
      return { in: 'title' };
    case 'fulltext':
      return { in: 'fullText', ...(chunk.section !== undefined && { section: chunk.section }) };
  }
}
