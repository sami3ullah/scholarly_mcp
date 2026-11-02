import { appError } from '@scholarly-mcp/core';
import type { CrossrefResponse } from './http/crossref-http.js';
import {
  crossrefFailureSchema,
  crossrefWorkListSchema,
  crossrefWorkSchema,
  type CrossrefWork,
} from './work/crossref-work.js';

/**
 * A parsed `/works` page. `invalid` counts items that did not match the work schema. The last
 * full page still carries a cursor, so the walk ends on the first empty page, whether or not
 * Crossref sends a cursor with it.
 */
export type WorksPage =
  | {
      readonly kind: 'page';
      readonly works: readonly CrossrefWork[];
      readonly invalid: number;
      readonly nextCursor?: string;
    }
  | { readonly kind: 'cursor-expired' };

/**
 * Reads a Crossref `/works` response. An expired or unknown cursor is reported so the caller
 * can restart; any other refusal or an unexpected shape is an AppError, because retrying the
 * same request will not fix it.
 */
export function readWorks(response: CrossrefResponse): WorksPage {
  if (response.status === 200) {
    const list = crossrefWorkListSchema.safeParse(response.body);
    if (!list.success) {
      throw appError('SOURCE_UNAVAILABLE', 'Crossref returned an unexpected works list');
    }
    const parsed = list.data.message.items.map((item) => crossrefWorkSchema.safeParse(item));
    const works = parsed.flatMap((result) => (result.success ? [result.data] : []));
    const next = list.data.message['next-cursor'];
    return {
      kind: 'page',
      works,
      invalid: parsed.length - works.length,
      ...(next !== undefined &&
        works.length + (parsed.length - works.length) > 0 && { nextCursor: next }),
    };
  }
  const failure = crossrefFailureSchema.safeParse(response.body);
  if (failure.success && failure.data.message.some((issue) => issue.type === 'cursor-invalid')) {
    return { kind: 'cursor-expired' };
  }
  throw appError(
    'SOURCE_UNAVAILABLE',
    `Crossref refused the request with HTTP ${String(response.status)}`,
  );
}
