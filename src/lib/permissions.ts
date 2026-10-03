import type { Profile } from "@/types";

export type PermKey =
  | "dashboard" | "inventory" | "closing" | "reports" | "trail" | "items" | "mapping" | "users"
  | "closing_edit" | "entries_unlock" | "reports_export" | "alerts";

export const PERMISSIONS: { key: PermKey; label: string; hint: string; group: "tabs" | "actions" }[] = [
  { key: "dashboard", label: "Dashboard", hint: "See today's status of every department", group: "tabs" },
  { key: "inventory", label: "Inventory entry", hint: "Open the entry of any department and date", group: "tabs" },
  { key: "closing", label: "Closing data", hint: "See all departments' closing in one grid", group: "tabs" },
  { key: "reports", label: "Reports", hint: "Open the Reports page", group: "tabs" },
  { key: "trail", label: "Audit trail", hint: "See who did what", group: "tabs" },
  { key: "items", label: "Items", hint: "Add and edit items, bulk upload", group: "tabs" },
  { key: "mapping", label: "Mapping", hint: "Choose which items each department sees", group: "tabs" },
  { key: "users", label: "Users", hint: "Create and manage department users", group: "tabs" },
  { key: "closing_edit", label: "Edit closing quantities", hint: "Change any department's saved quantity", group: "actions" },
  { key: "entries_unlock", label: "Unlock submitted entries", hint: "Reopen a submitted entry for editing", group: "actions" },
  { key: "reports_export", label: "Download reports", hint: "Excel, CSV and PDF downloads", group: "actions" },
  { key: "alerts", label: "See quantity alerts", hint: "Warnings for unusually high or low quantities", group: "actions" },
];

export const ALL_PERMS = PERMISSIONS.map((p) => p.key);

/** Suggested access for a NEW admin: can look at everything, but not change closing data or unlock entries. */
export const DEFAULT_ADMIN_PERMS: PermKey[] = ALL_PERMS.filter((k) => k !== "closing_edit" && k !== "entries_unlock");

/** Super Admin: everything. Admin: their list (none saved = everything). Department user: dashboard + inventory. */
export function can(p: Pick<Profile, "role" | "permissions">, key: PermKey): boolean {
  if (p.role === "super_admin") return true;
  if (p.role === "admin") return !p.permissions || p.permissions.includes(key);
  return key === "dashboard" || key === "inventory";
}

const LANDING: [PermKey, string][] = [
  ["dashboard", "/dashboard"],
  ["inventory", "/inventory"],
  ["closing", "/closing"],
  ["reports", "/reports"],
  ["trail", "/trail"],
  ["items", "/items"],
  ["mapping", "/mapping"],
  ["users", "/users"],
];

/** First page this user is allowed to open. */
export function landingPath(p: Pick<Profile, "role" | "permissions">): string {
  if (p.role === "department_user") return "/inventory";
  return LANDING.find(([k]) => can(p, k))?.[1] ?? "/no-access";
}
