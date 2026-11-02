import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import type { z } from 'zod';

/**
 * Wraps a zod schema so the SDK publishes its JSON Schema but accepts any arguments. The
 * tool layer parses the arguments itself, so a schema failure becomes `INVALID_INPUT` with
 * the field and allowed range, the same shape as every other tool error (ADR 0025), instead
 * of the SDK's free-text validation message.
 */
export function documentedOnly(schema: z.ZodType): StandardSchemaWithJSON {
  const standard = schema['~standard'];
  return { '~standard': { ...standard, validate: (value: unknown) => ({ value }) } };
}
