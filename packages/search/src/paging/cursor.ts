import { appError } from '@scholarly-mcp/core';

/** Where the next page starts, in the index it was computed on. */
export interface CursorState {
  readonly offset: number;
  readonly indexVersion: string;
}

/** No result list is longer than the two candidate lists together, so larger offsets are forged. */
const MAX_OFFSET = 10_000;

/** Encodes a cursor as opaque base64url, so callers pass it back rather than build it. */
export function encodeCursor({ offset, indexVersion }: CursorState): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ o: offset, v: indexVersion }));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/**
 * Decodes a cursor and checks it against the open index. Throws `INVALID_INPUT` for a cursor
 * this service did not write and `CURSOR_STALE` when the index was swapped since the first
 * page, because offsets into another index would skip or repeat results.
 */
export function decodeCursor(cursor: string, indexVersion: string): number {
  const state = parse(cursor);
  if (state === undefined) {
    throw appError('INVALID_INPUT', 'cursor is not one returned by search_articles', {
      field: 'cursor',
    });
  }
  if (state.indexVersion !== indexVersion) {
    throw appError('CURSOR_STALE', 'The index was updated since the first page; rerun the search');
  }
  return state.offset;
}

function parse(cursor: string): CursorState | undefined {
  try {
    const binary = atob(cursor.replaceAll('-', '+').replaceAll('_', '/'));
    const json: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))),
    );
    if (typeof json !== 'object' || json === null) return undefined;
    const { o, v } = json as Record<string, unknown>;
    const valid = Number.isInteger(o) && typeof o === 'number' && o > 0 && o <= MAX_OFFSET;
    return valid && typeof v === 'string' ? { offset: o, indexVersion: v } : undefined;
  } catch {
    return undefined;
  }
}
