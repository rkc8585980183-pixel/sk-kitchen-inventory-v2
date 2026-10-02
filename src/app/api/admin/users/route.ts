import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ALL_PERMS } from "@/lib/permissions";

const ROLES = ["super_admin", "admin", "department_user"];
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function adminClient() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(); // verified against Auth server: this route uses the service role
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, permissions").eq("id", user.id).single();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return null;
  // an Admin needs the "Users" permission
  if (profile.role === "admin" && profile.permissions && !profile.permissions.includes("users")) return null;
  return { id: user.id, role: profile.role as string };
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return fail("Forbidden", 403);

  const body = await req.json();
  const { username, full_name, email, password, role, department_id, permissions } = body;

  if (caller.role === "admin" && role !== "department_user") {
    return fail("Admins can only create department users", 403);
  }

  const admin = adminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return fail(createErr?.message || "Failed to create auth user");
  }

  const row: Record<string, unknown> = {
    id: created.user.id,
    username,
    full_name,
    email,
    role,
    department_id: role === "department_user" ? department_id : null,
  };
  if (role === "admin" && Array.isArray(permissions) && permissions.every((p) => (ALL_PERMS as string[]).includes(p))) {
    row.permissions = permissions;
  }

  const { error: profileErr } = await admin.from("profiles").insert(row);

  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail(/permissions|column/i.test(profileErr.message) ? "Run the latest supabase/migrations/001_entry_lock.sql in Supabase first." : profileErr.message);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return fail("Forbidden", 403);

  const body = await req.json().catch(() => null);
  if (!body?.user_id) return fail("Invalid request.");
  const { user_id, password, is_active, role, department_id, full_name, username, email } = body;
  const admin = adminClient();

  const { data: target } = await admin.from("profiles").select("id, role, email").eq("id", user_id).single();
  if (!target) return fail("User not found.", 404);

  // Admins may only manage department users, and may not change roles.
  if (caller.role === "admin" && (target.role !== "department_user" || role !== undefined)) {
    return fail("Admins can only manage department users", 403);
  }

  // Nobody can lock themselves out.
  if (user_id === caller.id && ((role !== undefined && role !== target.role) || is_active === false)) {
    return fail("You cannot change your own role or deactivate your own account.");
  }

  const updates: Record<string, unknown> = {};

  if (full_name !== undefined) {
    const v = String(full_name).trim();
    if (!v) return fail("Full name is required.");
    updates.full_name = v;
  }
  if (username !== undefined) {
    const v = String(username).trim();
    if (!v) return fail("Username is required.");
    updates.username = v;
  }

  let newEmail: string | undefined;
  if (email !== undefined) {
    const v = String(email).trim().toLowerCase();
    if (!emailOk(v)) return fail("Enter a valid email address.");
    if (v !== String(target.email ?? "").toLowerCase()) {
      newEmail = v;
      updates.email = v;
    }
  }

  if (is_active !== undefined) updates.is_active = !!is_active;

  if (role !== undefined) {
    if (!ROLES.includes(role)) return fail("Invalid role.");
    updates.role = role;
    if (role === "department_user") {
      if (!department_id) return fail("Select a department for this user.");
      updates.department_id = department_id;
    } else {
      updates.department_id = null;
    }
  } else if (department_id !== undefined) {
    updates.department_id = department_id;
  }

  if (password !== undefined && String(password).length < 6) return fail("Password must be at least 6 characters.");

  // 1) profile (catches duplicate usernames first)
  if (Object.keys(updates).length) {
    const { error } = await admin.from("profiles").update(updates).eq("id", user_id);
    if (error) return fail(error.code === "23505" ? "That username or email is already in use." : error.message);
  }

  // 2) login email (undo the profile email if the auth update is rejected)
  if (newEmail) {
    const { error } = await admin.auth.admin.updateUserById(user_id, { email: newEmail, email_confirm: true });
    if (error) {
      await admin.from("profiles").update({ email: target.email }).eq("id", user_id);
      return fail(error.message);
    }
  }

  // 3) password
  if (password) {
    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return fail(error.message);
  }

  return NextResponse.json({ ok: true });
}
