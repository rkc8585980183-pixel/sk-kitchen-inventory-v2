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
const validDays = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3650;

type Change = { id: string; back_days: number | null };
const validChanges = (v: unknown): v is Change[] =>
  Array.isArray(v) && v.every((c) => c && typeof c.id === "string" && validLimit(c.back_days));

export async function PUT(req: NextRequest) {
  const caller = await requireSuperAdmin();
  if (!caller) return NextResponse.json({ error: "Only Super Admin can change entry lock settings." }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { enabled, default_department_days, default_admin_days, departments = [], admins = [] } = body;
  if (
    typeof enabled !== "boolean" ||
    !validDays(default_department_days) ||
    !validDays(default_admin_days) ||
    !validChanges(departments) ||
    !validChanges(admins)
  ) {
    return NextResponse.json({ error: "Invalid values. Days must be whole numbers from 0 to 3650." }, { status: 400 });
  }

  const db = service();

  const { error: sErr } = await db.from("lock_settings").upsert({
    id: 1,
    enabled,
    default_department_days,
    default_admin_days,
    updated_at: new Date().toISOString(),
    updated_by: caller.id,
  });
  if (sErr) {
    const hint = /lock_settings|schema cache|does not exist/i.test(sErr.message)
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
      action: "entry_lock_updated",
      description: `Entry lock ${enabled ? "ON" : "OFF"} · default dept ${default_department_days}d, admin ${default_admin_days}d · ${departments.length} dept + ${admins.length} admin override(s) changed`,
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}
