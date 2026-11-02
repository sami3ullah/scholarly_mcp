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

  it('refuses to bind HTTP beyond loopback until API keys and Origin checks exist', () => {
    expect(() => parseConfig(serverConfigSchema, { ...base, HTTP_HOST: '0.0.0.0' })).toThrow(
      /HTTP_HOST must be a loopback address/,
    );
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
