import { landingConfigSchema } from '@scholarly-mcp/core';
import { embedderConfigSchema } from '@scholarly-mcp/embedder-onnx';
import { loggingConfigSchema } from '@scholarly-mcp/logger';
import { searchConfigSchema } from '@scholarly-mcp/search';
import { sqliteConfigSchema } from '@scholarly-mcp/store-sqlite';
import { z } from 'zod';
import { authConfigSchema } from './auth-config.js';
import { csv } from './csv.js';
import { meteringConfigSchema } from './metering-config.js';
import { telemetryConfigSchema } from './telemetry-config.js';

/** Hosts that only this machine can reach. */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * The server's own settings (ADR 0014, ADR 0025, ADR 0031). `MCP_TRANSPORT` picks stdio for
 * a local client such as Claude Desktop, or Streamable HTTP. `HTTP_ALLOWED_HOSTS` lists the
 * hostnames the `Host` header may name and `HTTP_ALLOWED_ORIGINS` the hostnames a browser
 * `Origin` may have; both default to localhost. `PUBLISHER_NAME` names the publisher in the
 * notice and tool descriptions (ADR 0015). `JOURNAL_URL_TEMPLATE` turns an ISSN into a
 * journal page link, with `{issn}` as the placeholder; without it no journal link is shown.
 */
export const serverOwnConfigSchema = z.object({
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  HTTP_HOST: z.string().min(1).default('127.0.0.1'),
  HTTP_PORT: z.coerce.number().int().min(0).max(65_535).default(8080),
  HTTP_ALLOWED_HOSTS: csv(),
  HTTP_ALLOWED_ORIGINS: csv(),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
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
  .extend(authConfigSchema.shape)
  .extend(meteringConfigSchema.shape)
  .extend(telemetryConfigSchema.shape)
  .extend(landingConfigSchema.shape)
  .extend(searchConfigSchema.shape)
  .extend(sqliteConfigSchema.shape)
  .extend(embedderConfigSchema.shape)
  .extend(loggingConfigSchema.shape)
  .superRefine((config, ctx) => {
    const exposed = config.MCP_TRANSPORT === 'http' && !LOOPBACK.has(config.HTTP_HOST);
    if (exposed && config.AUTH_MODE === 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'HTTP beyond loopback needs AUTH_MODE api-key or oauth',
      });
    }
    if (exposed && config.HTTP_ALLOWED_HOSTS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['HTTP_ALLOWED_HOSTS'],
        message: 'HTTP beyond loopback needs HTTP_ALLOWED_HOSTS, the public hostnames',
      });
    }
    if (config.AUTH_MODE === 'oauth') {
      for (const key of ['OAUTH_ISSUER', 'OAUTH_AUDIENCE', 'OAUTH_JWKS_URL'] as const) {
        if (config[key] === undefined) {
          ctx.addIssue({ code: 'custom', path: [key], message: `AUTH_MODE oauth needs ${key}` });
        }
      }
    }
  });

export type ServerConfig = z.output<typeof serverConfigSchema>;
