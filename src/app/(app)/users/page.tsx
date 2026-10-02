import { createClient } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import UsersClient from "./UsersClient";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const profile = await requirePerm("users");
  const supabase = await createClient();

  const [users, departments] = await Promise.all([
    supabase.from("profiles").select("*, departments(name)").order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
  ]);

  return <UsersClient initialUsers={users.data ?? []} departments={departments.data ?? []} currentRole={profile.role} currentUserId={profile.id} />;
}
