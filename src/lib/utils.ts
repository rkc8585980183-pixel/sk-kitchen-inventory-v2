export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const TZ = "Asia/Kolkata";

/** Today's date (YYYY-MM-DD) in India time. */
export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtDay(iso: string, withYear = false): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function fmtRange(start: string, end: string): string {
  return `${fmtDay(start)} – ${fmtDay(end, true)}`;
}

export function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: TZ,
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function roleLabel(role: string): string {
  return role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Department User";
}

export function fmtWeekday(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function chipLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", timeZone: "UTC" });
}

/** "21:30" -> "9:30 PM" */
export function fmtTime12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
