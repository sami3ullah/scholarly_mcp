import { landingConfigSchema } from '@scholarly-mcp/core';
import { embedderConfigSchema } from '@scholarly-mcp/embedder-onnx';
import { loggingConfigSchema } from '@scholarly-mcp/logger';
import { searchConfigSchema } from '@scholarly-mcp/search';
import { sqliteConfigSchema } from '@scholarly-mcp/store-sqlite';
import { z } from 'zod';

/** Hosts the HTTP transport may bind to until API keys and `Origin` checks land (SM-10). */
const LOOPBACK = ['127.0.0.1', '::1', 'localhost'] as const;

/**
 * The server's own settings (ADR 0014, ADR 0025). `MCP_TRANSPORT` picks stdio for a local
 * client such as Claude Desktop, or Streamable HTTP. `PUBLISHER_NAME` names the publisher in
 * the notice and tool descriptions (ADR 0015). `JOURNAL_URL_TEMPLATE` turns an ISSN into a
 * journal page link, with `{issn}` as the placeholder; without it no journal link is shown.
 */
export const serverOwnConfigSchema = z.object({
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  HTTP_HOST: z
    .enum(LOOPBACK, {
      error: 'HTTP_HOST must be a loopback address until API keys and Origin checks exist (SM-10)',
    })
    .default('127.0.0.1'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  PUBLISHER_NAME: z.string().min(1).max(60).default('the publisher'),
  JOURNAL_URL_TEMPLATE: z
    .url({ protocol: /^https?$/ })
    .refine((value) => value.includes('{issn}'), {
      message: 'JOURNAL_URL_TEMPLATE must contain {issn}',
    })
    .optional(),
  INDEX_REFRESH_MS: z.coerce.number().int().min(1000).max(3_600_000).default(30_000),
  SESSION_CLEANUP_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(3_600_000),
});

/** Everything the server reads from the environment, validated at boot. */
export const serverConfigSchema = serverOwnConfigSchema
  .extend(landingConfigSchema.shape)
  .extend(searchConfigSchema.shape)
  .extend(sqliteConfigSchema.shape)
  .extend(embedderConfigSchema.shape)
  .extend(loggingConfigSchema.shape);

export type ServerConfig = z.output<typeof serverConfigSchema>;
