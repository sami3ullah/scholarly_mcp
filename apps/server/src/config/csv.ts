import { z } from 'zod';

/** A comma-separated list setting: trimmed items, blanks dropped, empty when unset. */
export function csv() {
  return z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    );
}
