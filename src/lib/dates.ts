// All day calculations use India time so "today" matches the kitchen's clock,
// not the server's (Vercel runs in UTC).
const TZ = "Asia/Kolkata";

export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** limit = null means "no limit" (super admin). */
export function isWithinWindow(weekEnd: string, limit: number | null): boolean {
  if (limit === null) return true;
  return weekEnd.slice(0, 10) >= addDays(todayIST(), -limit);
}

export function oldestVisibleDay(limit: number | null): string | null {
  return limit === null ? null : addDays(todayIST(), -limit);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

export function fmtRange(start: string, end: string): string {
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function limitLabel(limit: number | null): string {
  if (limit === null) return "No limit";
  if (limit === 0) return "This week only";
  return `Last ${limit} day${limit === 1 ? "" : "s"}`;
}
