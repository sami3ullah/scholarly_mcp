import { parseConfig } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { serverConfigSchema } from './server-config.js';

const base = { LANDING_BASE_URL: 'http://localhost:3000' };

describe('serverConfigSchema', () => {
  it('defaults to stdio, loopback HTTP and a generic publisher name', () => {
    expect(parseConfig(serverConfigSchema, base)).toMatchObject({
      MCP_TRANSPORT: 'stdio',
      HTTP_HOST: '127.0.0.1',
      HTTP_PORT: 8080,
      PUBLISHER_NAME: 'the publisher',
      INDEX_REFRESH_MS: 30_000,
      INDEX_PATH: 'data/index.sqlite',
      RUNTIME_DB_PATH: 'data/runtime.sqlite',
    });
  });

  it('requires the landing base URL', () => {
    expect(() => parseConfig(serverConfigSchema, {})).toThrow(/LANDING_BASE_URL/);
  });

  it('refuses HTTP beyond loopback without auth and a Host allowlist', () => {
    const exposed = { ...base, MCP_TRANSPORT: 'http', HTTP_HOST: '0.0.0.0' };
    expect(() => parseConfig(serverConfigSchema, exposed)).toThrow(
      /AUTH_MODE: HTTP beyond loopback needs AUTH_MODE api-key, oauth or api-key\+oauth[\s\S]*HTTP_ALLOWED_HOSTS/,
    );
    expect(
      parseConfig(serverConfigSchema, {
        ...exposed,
        AUTH_MODE: 'api-key',
        LANDING_API_SECRET: 's'.repeat(32),
        HTTP_ALLOWED_HOSTS: 'mcp.example.org, ',
        HTTP_ALLOWED_ORIGINS: 'app.example.org',
      }),
    ).toMatchObject({
      HTTP_ALLOWED_HOSTS: ['mcp.example.org'],
      HTTP_ALLOWED_ORIGINS: ['app.example.org'],
    });
  });

  it('refuses the landing API beyond loopback without its secret', () => {
    const exposed = {
      ...base,
      MCP_TRANSPORT: 'http',
      HTTP_HOST: '0.0.0.0',
      AUTH_MODE: 'api-key',
      HTTP_ALLOWED_HOSTS: 'mcp.example.org',
    };
    expect(() => parseConfig(serverConfigSchema, exposed)).toThrow(/LANDING_API_SECRET/);
    expect(() =>
      parseConfig(serverConfigSchema, { ...exposed, LANDING_API_SECRET: 'short' }),
    ).toThrow(/at least 32 characters/);
  });

  it('guards a landing API on its own port by where that port listens', () => {
    const http = { ...base, MCP_TRANSPORT: 'http', AUTH_MODE: 'api-key' };
    expect(parseConfig(serverConfigSchema, { ...http, LANDING_API_PORT: '8081' })).toMatchObject({
      LANDING_API_HOST: '127.0.0.1',
      LANDING_API_PORT: 8081,
    });
    expect(() =>
      parseConfig(serverConfigSchema, {
        ...http,
        LANDING_API_HOST: '0.0.0.0',
        LANDING_API_PORT: '8081',
      }),
    ).toThrow(/HTTP_ALLOWED_HOSTS[\s\S]*LANDING_API_SECRET/);
    // A public MCP port with the landing API kept on loopback needs no landing secret.
    expect(
      parseConfig(serverConfigSchema, {
        ...http,
        HTTP_HOST: '0.0.0.0',
        HTTP_ALLOWED_HOSTS: 'mcp.example.org',
        LANDING_API_PORT: '8081',
      }).LANDING_API_SECRET,
    ).toBeUndefined();
  });

  it('serves HTTP alongside stdio on request, with the same guards but no MCP auth', () => {
    expect(parseConfig(serverConfigSchema, base)).toMatchObject({
      HTTP_ALONGSIDE_STDIO: false,
      LANDING_RATE_LIMIT_PER_MINUTE: 120,
      LANDING_RATE_LIMIT_BURST: 30,
    });
    const alongside = { ...base, HTTP_ALONGSIDE_STDIO: 'true', HTTP_HOST: '0.0.0.0' };
    expect(() => parseConfig(serverConfigSchema, alongside)).toThrow(
      /HTTP_ALLOWED_HOSTS[\s\S]*LANDING_API_SECRET/,
    );
    expect(
      parseConfig(serverConfigSchema, {
        ...alongside,
        HTTP_ALLOWED_HOSTS: 'landing-api.internal',
        LANDING_API_SECRET: 's'.repeat(32),
      }).HTTP_ALONGSIDE_STDIO,
    ).toBe(true);
  });

  it('allows stdio with any HTTP_HOST, since nothing listens', () => {
    expect(parseConfig(serverConfigSchema, { ...base, HTTP_HOST: '0.0.0.0' }).AUTH_MODE).toBe(
      'none',
    );
  });

  it('needs issuer, audience and key set URL for OAuth', () => {
    expect(() => parseConfig(serverConfigSchema, { ...base, AUTH_MODE: 'oauth' })).toThrow(
      /OAUTH_ISSUER[\s\S]*OAUTH_AUDIENCE[\s\S]*OAUTH_JWKS_URL/,
    );
  });

  it('needs the same OAuth settings when API keys and OAuth are both accepted', () => {
    expect(() => parseConfig(serverConfigSchema, { ...base, AUTH_MODE: 'api-key+oauth' })).toThrow(
      /api-key\+oauth needs OAUTH_ISSUER[\s\S]*OAUTH_AUDIENCE[\s\S]*OAUTH_JWKS_URL/,
    );
  });

  it('defaults rate limits, metering and auth cache, and checks the webhook secret length', () => {
    expect(parseConfig(serverConfigSchema, base)).toMatchObject({
      RATE_LIMIT_PER_MINUTE: 60,
      RATE_LIMIT_BURST: 20,
      AUTH_CACHE_MS: 5000,
      METER_JSONL_PATH: 'data/usage.jsonl',
      METER_EXPORT_MS: 5000,
      SHUTDOWN_TIMEOUT_MS: 10_000,
    });
    expect(() =>
      parseConfig(serverConfigSchema, { ...base, METER_WEBHOOK_SECRET: 'short' }),
    ).toThrow(/at least 32 characters/);
  });

  it('requires the {issn} placeholder in a journal URL template', () => {
    expect(() =>
      parseConfig(serverConfigSchema, { ...base, JOURNAL_URL_TEMPLATE: 'https://example.org/j' }),
    ).toThrow(/\{issn\}/);
    expect(
      parseConfig(serverConfigSchema, {
        ...base,
        JOURNAL_URL_TEMPLATE: 'https://example.org/j/{issn}',
      }).JOURNAL_URL_TEMPLATE,
    ).toBe('https://example.org/j/{issn}');
  });
});
