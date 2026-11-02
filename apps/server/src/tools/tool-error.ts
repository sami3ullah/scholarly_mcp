import { isAppError, type ErrorCode, type Logger } from '@scholarly-mcp/core';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';

/** The stable codes a tool error carries; `INTERNAL` is anything unexpected. */
export type ToolErrorCode = ErrorCode | 'INTERNAL';

/** The structured content of a tool error. */
export interface ToolErrorContent {
  readonly code: ToolErrorCode;
  readonly message: string;
  readonly field?: string;
  readonly retryAfter?: number;
  readonly notice: string;
}

/**
 * What the model reads for each code (PLAN.md "Errors"): something it can act on. Codes
 * whose cause is the caller's input keep the specific message; the others use a fixed one,
 * so file paths or low-level details never reach the model.
 */
const FIXED_MESSAGES: Partial<Record<ToolErrorCode, string>> = {
  CURSOR_STALE: 'The index was updated since that page; rerun the search without a cursor',
  INDEX_UNAVAILABLE: 'The search index is not available right now; retry shortly',
  SOURCE_UNAVAILABLE: 'The search index is not available right now; retry shortly',
  UNAUTHORIZED: 'The API key is missing, invalid or revoked; connect again with a valid key',
  INTERNAL: 'Something went wrong on the server; retry, and if it persists report it',
};

/**
 * Turns any thrown value into a tool error result with `isError: true`, a stable code and
 * no stack trace: the single place where errors become MCP results (PLAN.md "Errors").
 * Unexpected errors are logged with their stack; expected ones only by code.
 */
export function toolErrorResult(error: unknown, notice: string, logger: Logger): CallToolResult {
  const content = toErrorContent(error, notice);
  if (content.code === 'INTERNAL') {
    logger.error({ err: error }, 'Tool failed unexpectedly');
  }
  const retry =
    content.retryAfter === undefined ? '' : ` (retry after ${String(content.retryAfter)} s)`;
  return {
    isError: true,
    content: [{ type: 'text', text: `${content.code}: ${content.message}${retry}` }],
    structuredContent: { ...content },
  };
}

function toErrorContent(error: unknown, notice: string): ToolErrorContent {
  if (error instanceof z.ZodError) return invalidInput(error, notice);
  if (!isAppError(error)) {
    return { code: 'INTERNAL', message: FIXED_MESSAGES.INTERNAL ?? '', notice };
  }
  return {
    code: error.code,
    message: FIXED_MESSAGES[error.code] ?? error.message,
    ...(error.field !== undefined && { field: error.field }),
    ...(error.retryAfterSeconds !== undefined && { retryAfter: error.retryAfterSeconds }),
    notice,
  };
}

/** Names every wrong field with what was expected, e.g. "limit: Too big: expected <=10". */
function invalidInput(error: z.ZodError, notice: string): ToolErrorContent {
  const problems = error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });
  const field = error.issues[0]?.path.map(String).join('.');
  return {
    code: 'INVALID_INPUT',
    message: `Invalid arguments. ${problems.join('; ')}`,
    ...(field !== undefined && field !== '' && { field }),
    notice,
  };
}
