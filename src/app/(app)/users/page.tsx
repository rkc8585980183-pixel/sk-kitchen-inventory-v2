import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("profiles")
    .select("*, departments(name)")
    .order("created_at", { ascending: false });

  const { data: departments } = await supabase.from("departments").select("id, name").eq("is_active", true);

  return (
    <UsersClient
      initialUsers={users || []}
      departments={departments || []}
      currentRole={profile.role}
    />
  );
}
