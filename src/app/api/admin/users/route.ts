import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function adminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return null;
  return profile;
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { username, full_name, email, password, role, department_id } = body;

  if (caller.role === "admin" && role !== "department_user") {
    return NextResponse.json({ error: "Admins can only create department users" }, { status: 403 });
  }

  const admin = adminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message || "Failed to create auth user" }, { status: 400 });
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    full_name,
    email,
    role,
    department_id: role === "department_user" ? department_id : null,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { user_id, password, is_active, role, department_id, full_name } = body;
  const admin = adminClient();

  if (password) {
    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (is_active !== undefined) updates.is_active = is_active;
  if (role !== undefined) updates.role = role;
  if (department_id !== undefined) updates.department_id = department_id;
  if (full_name !== undefined) updates.full_name = full_name;

  if (Object.keys(updates).length) {
    const { error } = await admin.from("profiles").update(updates).eq("id", user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
