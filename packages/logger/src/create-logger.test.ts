import { describe, expect, it } from 'vitest';
import { createLogger } from './create-logger.js';
import { loggingConfigSchema } from './logging-config.js';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination = {
    write(line: string) {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
  return { lines, destination };
}

describe('createLogger', () => {
  it('writes structured JSON with the logger name', () => {
    const { lines, destination } = capture();
    createLogger({ name: 'server', level: 'info', destination }).info({ tool: 'cite' }, 'called');
    expect(lines[0]).toMatchObject({ name: 'server', tool: 'cite', msg: 'called' });
  });

  it.each([
    ['query text', { query: 'patient, 54, chest pain' }, 'chest pain'],
    ['nested query text', { input: { query: 'Vorhofflimmern bei Herrn M.' } }, 'Herrn M.'],
    ['an api key', { apiKey: 'sk_live_123' }, 'sk_live_123'],
    ['a landing token', { session: { token: 'AAAAAAAAAAAAAAAAAAAAAA' } }, 'AAAAAAAAAAAA'],
    ['an authorization header', { req: { headers: { authorization: 'Bearer abc' } } }, 'abc'],
  ])('redacts %s', (_case, fields, secret) => {
    const { lines, destination } = capture();
    createLogger({ name: 'server', level: 'info', destination }).info(fields, 'request');
    expect(JSON.stringify(lines[0])).not.toContain(secret);
    expect(JSON.stringify(lines[0])).toContain('[redacted]');
  });

  it('redacts in child loggers too', () => {
    const { lines, destination } = capture();
    const logger = createLogger({ name: 'server', level: 'info', destination });
    logger.child({ requestId: 'r1' }).warn({ query: 'secret topic' }, 'slow');
    expect(lines[0]).toMatchObject({ requestId: 'r1', query: '[redacted]' });
  });

  it('drops lines below the configured level', () => {
    const { lines, destination } = capture();
    createLogger({ name: 'server', level: 'warn', destination }).info({}, 'ignored');
    expect(lines).toHaveLength(0);
  });
});

describe('loggingConfigSchema', () => {
  it('defaults LOG_LEVEL to info', () => {
    expect(loggingConfigSchema.parse({}).LOG_LEVEL).toBe('info');
  });

  it('rejects unknown levels', () => {
    expect(loggingConfigSchema.safeParse({ LOG_LEVEL: 'verbose' }).success).toBe(false);
  });
});
