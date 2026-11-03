import { describe, expect, it } from 'vitest';
import { withSecretFiles } from './secret-files.js';

const files: Record<string, string> = {
  '/run/secrets/landing': 'l'.repeat(32) + '\n',
  '/run/secrets/db': 'postgres://u:p@db/x\r\n',
};
const read = (path: string): string => {
  const contents = files[path];
  if (contents === undefined) throw new Error(`ENOENT: ${path}`);
  return contents;
};

describe('withSecretFiles', () => {
  it('reads each listed secret from its file, without the trailing newline', () => {
    const env = withSecretFiles(
      { LANDING_API_SECRET_FILE: '/run/secrets/landing', DATABASE_URL_FILE: '/run/secrets/db' },
      ['LANDING_API_SECRET', 'DATABASE_URL'],
      read,
    );
    expect(env['LANDING_API_SECRET']).toBe('l'.repeat(32));
    expect(env['DATABASE_URL']).toBe('postgres://u:p@db/x');
  });

  it('leaves the environment alone when no file is named', () => {
    const env = { LANDING_API_SECRET: 'x', LOG_LEVEL: 'info' };
    expect(withSecretFiles(env, ['LANDING_API_SECRET'], read)).toEqual(env);
  });

  it('ignores _FILE variables that are not listed secrets', () => {
    const env = withSecretFiles({ JOURNAL_SUBJECTS_FILE: '/missing.json' }, ['DATABASE_URL'], read);
    expect(env['JOURNAL_SUBJECTS']).toBeUndefined();
  });

  it('treats a blank value as unset on either side', () => {
    expect(
      withSecretFiles(
        { LANDING_API_SECRET: ' ', LANDING_API_SECRET_FILE: '/run/secrets/landing' },
        ['LANDING_API_SECRET'],
        read,
      )['LANDING_API_SECRET'],
    ).toBe('l'.repeat(32));
    expect(
      withSecretFiles({ DATABASE_URL_FILE: '' }, ['DATABASE_URL'], read)['DATABASE_URL'],
    ).toBeUndefined();
  });

  it('reports both forms and unreadable files at once, never echoing contents or paths', () => {
    const run = () =>
      withSecretFiles(
        {
          LANDING_API_SECRET: 'inline',
          LANDING_API_SECRET_FILE: '/run/secrets/landing',
          DATABASE_URL_FILE: '/run/secrets/hunter2',
        },
        ['LANDING_API_SECRET', 'DATABASE_URL'],
        read,
      );
    expect(run).toThrow(/LANDING_API_SECRET: set[\s\S]*DATABASE_URL_FILE: the file cannot be read/);
    expect(run).toThrow(
      expect.objectContaining({ message: expect.not.stringMatching(/inline|hunter2/) as string }),
    );
  });
});
