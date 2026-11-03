import { appError } from '@scholarly-mcp/core';
import { z } from 'zod';

const payloadSchema = z.object({ v: z.literal(1), offset: z.int().min(0) });

/** Encodes how far a DOI-list run has got, as URL-safe text. */
export function encodeListCursor(offset: number): string {
  const payload: z.input<typeof payloadSchema> = { v: 1, offset };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Decodes a cursor from {@link encodeListCursor}; anything else is invalid input. */
export function decodeListCursor(cursor: string): number {
  const parsed = payloadSchema.safeParse(parseJson(Buffer.from(cursor, 'base64url').toString()));
  if (!parsed.success) throw appError('INVALID_INPUT', 'Unknown cursor for source crossref');
  return parsed.data.offset;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
