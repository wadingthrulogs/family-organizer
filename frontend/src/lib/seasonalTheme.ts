import type { ThemeId } from '../contexts/ThemeContext';

/**
 * Which holiday theme applies on a given date, if any.
 *
 * The wall display runs unattended for months, so this is date-driven rather
 * than something a person has to remember to flip:
 *
 *   Oct 1 – Oct 31                       → halloween
 *   Nov 1 – Thanksgiving Day (4th Thu)   → thanksgiving
 *   day after Thanksgiving – Jan 1       → christmas
 *   anything else                        → null (use the user's own theme)
 *
 * Local time: the household thinks in its own timezone.
 */
export function resolveSeasonalTheme(date = new Date()): ThemeId | null {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const day = date.getDate();

  if (month === 9) return 'halloween';

  if (month === 10) {
    return day <= thanksgivingDay(year) ? 'thanksgiving' : 'christmas';
  }

  if (month === 11) return 'christmas';
  if (month === 0 && day === 1) return 'christmas';

  return null;
}

/** Day-of-month of US Thanksgiving (fourth Thursday of November). */
export function thanksgivingDay(year: number): number {
  const nov1 = new Date(year, 10, 1).getDay(); // 0 = Sun … 4 = Thu
  const firstThursday = 1 + ((4 - nov1 + 7) % 7);
  return firstThursday + 21;
}

/** Human-readable schedule, for the settings UI. */
export const SEASONAL_SCHEDULE_TEXT =
  'Halloween through October, Thanksgiving from November 1st through Thanksgiving Day, and Christmas from the day after through New Year’s Day. The rest of the year uses the theme you pick above.';
