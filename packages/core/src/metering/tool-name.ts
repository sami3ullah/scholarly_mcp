import { z } from 'zod';

/** The six MCP tools the server exposes. */
export const toolNameSchema = z.enum([
  'search_articles',
  'get_article',
  'find_related',
  'get_journal',
  'cite',
  'check_access',
]);

export type ToolName = z.infer<typeof toolNameSchema>;
