import { tokenSchema, toolNameSchema } from '@scholarly-mcp/core';
import { z } from 'zod';

/** The path the browser beacon posts to. */
export const VISIT_PATH = '/mcp/landing/visit';

/** What the beacon sends: the token and the tool that made the link. Never query text. */
export const visitSchema = z.strictObject({ t: tokenSchema, tool: toolNameSchema.optional() });

export type Visit = z.infer<typeof visitSchema>;
