import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/admin/unlock-entry
 *  Body: { department_id: string, date: string (YYYY-MM-DD) }
 *  Finds the inventory period for that dept+date and calls unlock_period().
 *  Allowed for Super Admin; Admins with entries_unlock perm can also call this.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissions, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: "No active profile." }, { status: 403 });
  }

  const isSuperAdmin = profile.role === "super_admin";
  const hasUnlockPerm =
    profile.role === "admin" &&
    (!profile.permissions || (profile.permissions as string[]).includes("entries_unlock"));

  if (!isSuperAdmin && !hasUnlockPerm) {
    return NextResponse.json(
      { error: "Only Super Admin or an Admin with 'Unlock submitted entries' permission can unlock entries." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { department_id, date } = body;

  if (
    typeof department_id !== "string" ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return NextResponse.json(
      { error: "department_id (UUID) and date (YYYY-MM-DD) are required." },
      { status: 400 }
    );
  }

  // Find the period for this dept + date
  const { data: period, error: pErr } = await supabase
    .from("inventory_periods")
    .select("id, status")
    .eq("department_id", department_id)
    .eq("week_start", date)
    .eq("week_end", date)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  if (!period) {
    return NextResponse.json(
      { error: "No entry found for this department and date." },
      { status: 404 }
    );
  }

  if (!["submitted", "time_locked", "unlocked"].includes(period.status)) {
    return NextResponse.json(
      { error: `Entry is '${period.status}' — only submitted or locked entries can be unlocked.` },
      { status: 400 }
    );
  }

  // Call the DB function (enforces permissions + writes audit log)
  const { data: updated, error: uErr } = await supabase
    .rpc("unlock_period", { p_period_id: period.id });

  if (uErr) {
    const msg = uErr.message ?? "";
    if (msg.includes("PERMISSION_DENIED")) {
      return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, period: updated });
}
