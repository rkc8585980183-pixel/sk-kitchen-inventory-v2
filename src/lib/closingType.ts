/**
 * Determine whether an inventory period is a "weekly" or "monthly" closing.
 *
 * Logic (mirrors the DB function closing_type_for):
 *  1. If lock_settings.closing_mode = 'monthly'  → 'monthly'
 *  2. Else if week_end is the last day of its calendar month → 'monthly'
 *  3. Else → 'weekly'
 */
export type ClosingType = "weekly" | "monthly";

/**
 * Client-side helper — pass week_start and week_end as "YYYY-MM-DD" strings.
 * Also accepts an optional closingMode from lock_settings if available.
 */
export function detectClosingType(
  weekStart: string,
  weekEnd: string,
  closingMode?: string | null
): ClosingType {
  if (closingMode === "monthly") return "monthly";

  // Is week_end the last calendar day of its month?
  const end = new Date(weekEnd + "T00:00:00"); // local midnight
  const lastOfMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0);
  if (end.getDate() === lastOfMonth.getDate()) return "monthly";

  return "weekly";
}

export function closingTypeLabel(type: ClosingType): string {
  return type === "monthly" ? "Monthly closing" : "Weekly closing";
}
