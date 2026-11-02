import { z } from 'zod';

/**
 * A publication date with the precision the source actually gave. Missing parts are not
 * invented, so citations can print "2024" rather than a fake "2024-01-01".
 */
export const publishedDateSchema = z
  .object({
    year: z.int().min(1600).max(2200),
    month: z.int().min(1).max(12).optional(),
    day: z.int().min(1).max(31).optional(),
  })
  .refine((date) => date.day === undefined || date.month !== undefined, {
    message: 'A day needs a month',
  })
  .refine(
    (date) =>
      date.day === undefined ||
      date.month === undefined ||
      date.day <= daysInMonth(date.year, date.month),
    { message: 'Day is outside the month' },
  );

export type PublishedDate = z.infer<typeof publishedDateSchema>;

/** The precision a published date carries, derived from which parts are present. */
export type DatePrecision = 'day' | 'month' | 'year';

/** Returns how precise a published date is. */
export function datePrecision(date: PublishedDate): DatePrecision {
  if (date.day !== undefined) return 'day';
  return date.month === undefined ? 'year' : 'month';
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
