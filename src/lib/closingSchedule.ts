import { addDays, fmtTime12 } from "@/lib/utils";

/** The closing schedule is set by the Admin (Settings). Departments only read it. */
export type ClosingMode = "off" | "daily" | "weekly" | "monthly";

export interface ClosingSchedule {
  mode: ClosingMode;
  /** "HH:MM" India time: the closing entry opens at this time on the closing date */
  time: string;
  /** weekly: 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** monthly: "month_end" = last day of the month, "day" = a fixed day of the month */
  monthRule: "month_end" | "day";
  /** monthly + "day": 1..31 (a short month uses its last day) */
  monthDay: number;
}

export const DEFAULT_SCHEDULE: ClosingSchedule = { mode: "off", time: "23:00", weekday: 0, monthRule: "month_end", monthDay: 1 };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const utc = (iso: string) => new Date(iso + "T00:00:00Z");
const daysInMonth = (iso: string) => {
  const d = utc(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
};

export const isScheduleOn = (s: ClosingSchedule) => s.mode !== "off";

/** Is a closing entry required on this date? (schedule OFF = every day, like before) */
export function isClosingDate(s: ClosingSchedule, iso: string): boolean {
  switch (s.mode) {
    case "weekly":
      return utc(iso).getUTCDay() === s.weekday;
    case "monthly": {
      const day = utc(iso).getUTCDate();
      const last = daysInMonth(iso);
      return s.monthRule === "month_end" ? day === last : day === Math.min(s.monthDay, last);
    }
    default:
      return true;
  }
}

export function latestClosingOnOrBefore(s: ClosingSchedule, iso: string): string | null {
  for (let i = 0; i <= 62; i++) {
    const d = addDays(iso, -i);
    if (isClosingDate(s, d)) return d;
  }
  return null;
}

export function nextClosingAfter(s: ClosingSchedule, iso: string): string | null {
  for (let i = 1; i <= 62; i++) {
    const d = addDays(iso, i);
    if (isClosingDate(s, d)) return d;
  }
  return null;
}

export function describeSchedule(s: ClosingSchedule): string {
  const at = ` · ${fmtTime12(s.time)}`;
  switch (s.mode) {
    case "daily":
      return `Daily closing${at}`;
    case "weekly":
      return `Weekly closing · every ${WEEKDAYS[s.weekday]}${at}`;
    case "monthly":
      return s.monthRule === "month_end"
        ? `Monthly closing · last day of every month${at}`
        : `Monthly closing · day ${s.monthDay} of every month${at}`;
    default:
      return "Closing every day";
  }
}
