import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ALL_PERMS } from "@/lib/permissions";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Forbidden", 403);
  const { data: caller } = await supabase.from("profiles").select("role, username").eq("id", user.id).single();
  if (caller?.role !== "super_admin") return fail("Only Super Admin can change permissions.", 403);

  const body = await req.json().catch(() => null);
  const perms: unknown = body?.permissions;
  if (!body?.user_id || !Array.isArray(perms) || !perms.every((p) => typeof p === "string" && (ALL_PERMS as string[]).includes(p))) {
    return fail("Invalid permissions.");
  }

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: target } = await db.from("profiles").select("id, role, full_name").eq("id", body.user_id).single();
  if (!target || target.role !== "admin") return fail("Permissions can only be set for Admin accounts.");

  const { error } = await db.from("profiles").update({ permissions: Array.from(new Set(perms)) }).eq("id", body.user_id);
  if (error) {
    return fail(/permissions|column/i.test(error.message) ? "Run the latest supabase/migrations/001_entry_lock.sql in Supabase first." : error.message);
  }

  try {
    await db.from("audit_logs").insert({
      username: caller.username,
      role: caller.role,
      action: "permissions_updated",
      description: `Permissions of ${target.full_name} set to ${perms.length} of ${ALL_PERMS.length}`,
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
