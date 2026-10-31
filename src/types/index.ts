export type Role = "super_admin" | "admin" | "department_user";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: Role;
  department_id: string | null;
  is_active: boolean;
  /** Entry-lock window override (admins). null = default, -1 = no limit */
  back_days?: number | null;
  /** Admin access list. null/undefined = full access (see lib/permissions.ts) */
  permissions?: string[] | null;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  /** Entry-lock window override. null = default, -1 = no limit */
  back_days?: number | null;
}

export interface Item {
  id: string;
  item_code: string;
  item_name: string;
  category: string | null;
  unit: string;
  is_active: boolean;
}

/** time_locked = auto-locked at closing time before submission (Locked – Pending) */
export type PeriodStatus = "pending" | "submitted" | "unlocked" | "time_locked";

export interface InventoryPeriod {
  id: string;
  inv_code: string;
  department_id: string;
  week_start: string;
  week_end: string;
  status: PeriodStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  unlocked_by: string | null;
  unlocked_at: string | null;
  resubmit_count: number;
}

export type PeriodLite = Pick<InventoryPeriod, "id" | "inv_code" | "week_start" | "week_end" | "status">;

export interface InventoryEntry {
  id: string;
  period_id: string;
  item_id: string;
  quantity: number | null;
}

export interface LockSettings {
  id: number;
  enabled: boolean;
  default_department_days: number;
  default_admin_days: number;
  time_lock_enabled: boolean;
  entry_open_time: string;
  entry_close_time: string;
}

/** One row returned by dashboard_status() DB function */
export interface DashboardRow {
  department_id: string;
  department_name: string;
  department_code: string;
  outlet_code: string;
  entry_status: "pending" | "submitted" | "unlocked" | "time_locked" | "missed" | "no_entry";
  submitted_at: string | null;
  unlocked_at: string | null;
  inv_code: string | null;
  item_count: number;
  filled_count: number;
}
