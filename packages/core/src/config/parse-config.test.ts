import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FULLTEXT_LICENSES, fulltextConfigSchema } from './fulltext-config.js';
import { landingConfigSchema } from './landing-config.js';
import { parseConfig } from './parse-config.js';

const schema = z.object({ API_SECRET: z.string().min(32), PORT: z.coerce.number().int() });

describe('parseConfig', () => {
  it('returns typed config for valid env', () => {
    expect(parseConfig(schema, { API_SECRET: 's'.repeat(32), PORT: '8080' })).toEqual({
      API_SECRET: 's'.repeat(32),
      PORT: 8080,
    });
  });

  it('reports every problem at once', () => {
    expect(() => parseConfig(schema, { API_SECRET: 'short', PORT: 'x' })).toThrow(
      /API_SECRET[\s\S]*PORT/,
    );
  });

  it('never echoes a value, which could be a secret', () => {
    expect(() => parseConfig(schema, { API_SECRET: 'hunter2', PORT: '1' })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('hunter2') as string }),
    );
  });

  it('treats blank values as unset', () => {
    expect(() => parseConfig(schema, { API_SECRET: '   ', PORT: '1' })).toThrow(/API_SECRET/);
  });
});

describe('fulltextConfigSchema', () => {
  it('defaults to CC BY and CC BY-NC-ND 4.0 (ADR 0003)', () => {
    expect(parseConfig(fulltextConfigSchema, {}).FULLTEXT_LICENSE_ALLOWLIST).toEqual([
      ...DEFAULT_FULLTEXT_LICENSES,
    ]);
  });

  it('splits and trims a custom list', () => {
    const env = { FULLTEXT_LICENSE_ALLOWLIST: ' https://a.example/l , https://b.example/l,' };
    expect(parseConfig(fulltextConfigSchema, env).FULLTEXT_LICENSE_ALLOWLIST).toEqual([
      'https://a.example/l',
      'https://b.example/l',
    ]);
  });

  it.each([',', 'not-a-url'])('rejects %j', (value) => {
    expect(() => parseConfig(fulltextConfigSchema, { FULLTEXT_LICENSE_ALLOWLIST: value })).toThrow(
      /FULLTEXT_LICENSE_ALLOWLIST/,
    );
  });
});

describe('landingConfigSchema', () => {
  it('requires LANDING_BASE_URL', () => {
    expect(() => parseConfig(landingConfigSchema, {})).toThrow(/LANDING_BASE_URL/);
  });

  it('rejects non-http schemes', () => {
    expect(() =>
      parseConfig(landingConfigSchema, { LANDING_BASE_URL: 'javascript:alert(1)' }),
    ).toThrow(/LANDING_BASE_URL/);
  });
});
