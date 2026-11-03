import { landingConfigSchema, storeConfigSchema } from '@scholarly-mcp/core';
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
 * `HTTP_ALONGSIDE_STDIO` also serves the HTTP routes other than `/mcp` (health, metrics,
 * landing API) while MCP runs on stdio, so a local client's links open a working landing
 * page. The landing API (ADR 0032) takes `LANDING_API_SECRET` as a bearer token and allows
 * `LANDING_RATE_LIMIT_PER_MINUTE` requests a minute per visitor, in bursts of
 * `LANDING_RATE_LIMIT_BURST`. `LANDING_API_PORT` moves the landing API off the public port to
 * its own listener on `LANDING_API_HOST`, so only the landing app's network reaches it; the
 * public port then answers 404 below `/landing/v1/`.
 */
export const serverOwnConfigSchema = z.object({
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  HTTP_HOST: z.string().min(1).default('127.0.0.1'),
  HTTP_PORT: z.coerce.number().int().min(0).max(65_535).default(8080),
  HTTP_ALLOWED_HOSTS: csv(),
  HTTP_ALLOWED_ORIGINS: csv(),
  HTTP_ALONGSIDE_STDIO: z.stringbool().default(false),
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
  LANDING_API_SECRET: z
    .string()
    .min(32, 'LANDING_API_SECRET must be at least 32 characters')
    .optional(),
  LANDING_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1_000_000).default(120),
  LANDING_RATE_LIMIT_BURST: z.coerce.number().int().min(1).max(100_000).default(30),
  LANDING_API_HOST: z.string().min(1).default('127.0.0.1'),
  LANDING_API_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
});

/** Everything the server reads from the environment, validated at boot. */
export const serverConfigSchema = serverOwnConfigSchema
  .extend(authConfigSchema.shape)
  .extend(meteringConfigSchema.shape)
  .extend(telemetryConfigSchema.shape)
  .extend(landingConfigSchema.shape)
  .extend(searchConfigSchema.shape)
  .extend(storeConfigSchema.shape)
  .extend(sqliteConfigSchema.shape)
  .extend(embedderConfigSchema.shape)
  .extend(loggingConfigSchema.shape)
  .superRefine((config, ctx) => {
    const http = config.MCP_TRANSPORT === 'http' || config.HTTP_ALONGSIDE_STDIO;
    const exposed = http && !LOOPBACK.has(config.HTTP_HOST);
    // Where the landing API listens: its own port when set, else the public one.
    const landingExposed =
      http &&
      !LOOPBACK.has(
        config.LANDING_API_PORT === undefined ? config.HTTP_HOST : config.LANDING_API_HOST,
      );
    if (exposed && config.MCP_TRANSPORT === 'http' && config.AUTH_MODE === 'none') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'HTTP beyond loopback needs AUTH_MODE api-key or oauth',
      });
    }
    if ((exposed || landingExposed) && config.HTTP_ALLOWED_HOSTS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['HTTP_ALLOWED_HOSTS'],
        message: 'HTTP beyond loopback needs HTTP_ALLOWED_HOSTS, the public hostnames',
      });
    }
    if (landingExposed && config.LANDING_API_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['LANDING_API_SECRET'],
        message: 'HTTP beyond loopback needs LANDING_API_SECRET for the landing API',
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
