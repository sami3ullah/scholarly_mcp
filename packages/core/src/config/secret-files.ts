import type { Env } from './parse-config.js';

/** The suffix of a variable that names a file holding another variable's value. */
const FILE_SUFFIX = '_FILE';

/**
 * Resolves `<NAME>_FILE` for each listed secret: the named file's contents, without one
 * trailing newline, become `<NAME>`, so secrets can come from a mounted secret store (Docker
 * and Kubernetes secrets) instead of the environment. Only listed names are resolved, since
 * other `_FILE` variables (`JOURNAL_SUBJECTS_FILE`) mean something else. Setting both forms,
 * or naming a file that cannot be read, fails with every problem at once. `read` does the I/O,
 * so core stays pure; messages never echo a value or a file's contents.
 */
export function withSecretFiles(
  env: Env,
  names: readonly string[],
  read: (path: string) => string,
): Env {
  const resolved: Record<string, string | undefined> = { ...env };
  const problems: string[] = [];
  for (const name of names) {
    const fileVar = `${name}${FILE_SUFFIX}`;
    const path = env[fileVar];
    if (path === undefined || path.trim() === '') continue;
    if (env[name] !== undefined && env[name].trim() !== '') {
      problems.push(`- ${name}: set ${name} or ${fileVar}, not both`);
      continue;
    }
    try {
      resolved[name] = read(path.trim()).replace(/\r?\n$/, '');
    } catch {
      problems.push(`- ${fileVar}: the file cannot be read`);
    }
  }
  if (problems.length > 0) throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  return resolved;
}
