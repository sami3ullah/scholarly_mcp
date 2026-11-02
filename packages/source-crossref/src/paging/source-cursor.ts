import { appError } from '@scholarly-mcp/core';
import { z } from 'zod';

/**
 * Where a run is, encoded in the opaque cursor ingestion checkpoints after every page.
 * `crossref` is Crossref's own cursor; `from` is the lower bound of the Crossref query, which
 * moves to `watermark` (the latest deposit seen) when an expired cursor forces a restart.
 */
export interface CursorState {
  readonly crossref: string;
  readonly from?: Date;
  readonly watermark?: Date;
}

const payloadSchema = z.object({
  v: z.literal(1),
  crossref: z.string().min(1),
  from: z.iso.datetime().optional(),
  watermark: z.iso.datetime().optional(),
});

/** Encodes a cursor state as URL-safe text. */
export function encodeCursor(state: CursorState): string {
  const payload: z.input<typeof payloadSchema> = {
    v: 1,
    crossref: state.crossref,
    ...(state.from && { from: state.from.toISOString() }),
    ...(state.watermark && { watermark: state.watermark.toISOString() }),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Decodes a cursor from {@link encodeCursor}; anything else is invalid input. */
export function decodeCursor(cursor: string): CursorState {
  const parsed = payloadSchema.safeParse(parseJson(Buffer.from(cursor, 'base64url').toString()));
  if (!parsed.success) throw appError('INVALID_INPUT', 'Unknown cursor for source crossref');
  const { crossref, from, watermark } = parsed.data;
  return {
    crossref,
    ...(from && { from: new Date(from) }),
    ...(watermark && { watermark: new Date(watermark) }),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
