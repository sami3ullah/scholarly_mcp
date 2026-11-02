import type { License } from './license.js';

/**
 * The licence gate: returns the version-of-record licence when it is in force at `now`.
 * Only the version of record decides, because that is the text a reader and Europe PMC see.
 * A start date in the future is an embargo, so the record stays closed until then. No
 * version-of-record licence means the terms are unknown, so the record is metadata only.
 * With several version-of-record entries, the most recently started one in force wins.
 */
export function activeLicense(licenses: readonly License[], now: Date): License | undefined {
  return licenses
    .filter((license) => license.contentVersion === 'vor' && license.start <= now)
    .reduce<License | undefined>(
      (latest, license) =>
        latest === undefined || license.start > latest.start ? license : latest,
      undefined,
    );
}
