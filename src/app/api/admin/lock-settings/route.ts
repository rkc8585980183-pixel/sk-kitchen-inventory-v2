import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const service = () =>
  createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("id, role, username").eq("id", user.id).single();
  return profile?.role === "super_admin" ? profile : null;
}

// null = use default, -1 = no limit, 0..3650 = days back
const validLimit = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isInteger(v) && (v === -1 || (v >= 0 && v <= 3650)));
const validTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const validDays = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3650;

type Change = { id: string; back_days: number | null };
const validChanges = (v: unknown): v is Change[] =>
  Array.isArray(v) && v.every((c) => c && typeof c.id === "string" && validLimit(c.back_days));

export async function PUT(req: NextRequest) {
  const caller = await requireSuperAdmin();
  if (!caller) return NextResponse.json({ error: "Only Super Admin can change entry lock settings." }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { enabled, default_department_days, default_admin_days, time_lock_enabled, entry_open_time, entry_close_time, closing_mode, closing_time, closing_weekday, closing_month_rule, closing_month_day, departments = [], admins = [] } = body;
  if (
    typeof enabled !== "boolean" ||
    typeof time_lock_enabled !== "boolean" ||
    !(["off", "daily", "weekly", "monthly"] as unknown[]).includes(closing_mode) ||
    !validTime(closing_time) ||
    !Number.isInteger(closing_weekday) || closing_weekday < 0 || closing_weekday > 6 ||
    !(["month_end", "day"] as unknown[]).includes(closing_month_rule) ||
    !Number.isInteger(closing_month_day) || closing_month_day < 1 || closing_month_day > 31 ||
    !validTime(entry_open_time) ||
    !validTime(entry_close_time) ||
    !validDays(default_department_days) ||
    !validDays(default_admin_days) ||
    !validChanges(departments) ||
    !validChanges(admins)
  ) {
    return NextResponse.json({ error: "Invalid values. Days must be whole numbers from 0 to 3650 and times must look like 09:30." }, { status: 400 });
  }

  const db = service();

  const { error: sErr } = await db.from("lock_settings").upsert({
    id: 1,
    enabled,
    default_department_days,
    default_admin_days,
    time_lock_enabled,
    entry_open_time,
    entry_close_time,
    closing_mode,
    closing_time,
    closing_weekday,
    closing_month_rule,
    closing_month_day,
    updated_at: new Date().toISOString(),
    updated_by: caller.id,
  });
  if (sErr) {
    const hint = /lock_settings|schema cache|does not exist|column/i.test(sErr.message)
      ? " Run supabase/migrations/001_entry_lock.sql in the Supabase SQL Editor first."
      : "";
    return NextResponse.json({ error: sErr.message + hint }, { status: 400 });
  }

  const results = await Promise.all([
    ...departments.map((d: Change) => db.from("departments").update({ back_days: d.back_days }).eq("id", d.id)),
    // only real admin accounts can be changed through this endpoint
    ...admins.map((a: Change) => db.from("profiles").update({ back_days: a.back_days }).eq("id", a.id).eq("role", "admin")),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 400 });

  // Best-effort audit entry (never blocks the save).
  try {
    await db.from("audit_logs").insert({
      username: caller.username,
      role: caller.role,
      action: "settings_updated",
      description: `Settings saved · entry time ${time_lock_enabled ? `${entry_open_time}-${entry_close_time}` : "OFF"} · entry lock ${enabled ? "ON" : "OFF"} · default dept ${default_department_days}d, admin ${default_admin_days}d · ${departments.length} dept + ${admins.length} admin override(s) changed`,
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}
