import type { LogFields, Logger } from '@scholarly-mcp/core';

/** A log line as captured by {@link createTestLogger}. */
export interface CapturedLine {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly fields: LogFields;
  readonly message: string;
}

/** A logger that keeps lines in memory, so tests can check what was logged. */
export function createTestLogger(lines: CapturedLine[] = [], bindings: LogFields = {}): Logger {
  const log = (level: CapturedLine['level']) => (fields: LogFields, message: string) => {
    lines.push({ level, fields: { ...bindings, ...fields }, message });
  };
  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    child: (more) => createTestLogger(lines, { ...bindings, ...more }),
  };
}
