export type Role = "super_admin" | "admin" | "department_user";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: Role;
  department_id: string | null;
  is_active: boolean;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface Item {
  id: string;
  item_code: string;
  item_name: string;
  category: string | null;
  unit: string;
  is_active: boolean;
}

export interface InventoryPeriod {
  id: string;
  inv_code: string;
  department_id: string;
  week_start: string;
  week_end: string;
  status: "pending" | "submitted" | "unlocked";
  submitted_by: string | null;
  submitted_at: string | null;
  unlocked_by: string | null;
  unlocked_at: string | null;
  resubmit_count: number;
}

export interface InventoryEntry {
  id: string;
  period_id: string;
  item_id: string;
  quantity: number | null;
}
