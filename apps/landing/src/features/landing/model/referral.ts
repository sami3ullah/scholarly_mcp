import { doiSchema, landingActionSchema, tokenSchema, toolNameSchema } from '@scholarly-mcp/core';
import { z } from 'zod';

/** Where the browser posts a visit and an access button click. */
export const VISIT_PATH = '/mcp/landing/visit';
export const ACTION_PATH = '/mcp/landing/action';

/**
 * What the visit beacon sends (ADR 0033): the token, the result opened and the tool that
 * made the link. Never query text.
 */
export const visitSchema = z.strictObject({
  t: tokenSchema,
  doi: doiSchema,
  tool: toolNameSchema.optional(),
});
export type Visit = z.infer<typeof visitSchema>;
/** A visit as the browser builds it, before the DOI is checked. */
export type VisitBeacon = z.input<typeof visitSchema>;

/** What the action beacon sends: the token, the result and the access button clicked. */
export const actionSchema = z.strictObject({
  t: tokenSchema,
  doi: doiSchema,
  action: landingActionSchema,
});
export type Action = z.infer<typeof actionSchema>;
export type ActionBeacon = z.input<typeof actionSchema>;
