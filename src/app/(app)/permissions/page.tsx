import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ALL_PERMS } from "@/lib/permissions";
import PermissionsClient from "./PermissionsClient";

export const metadata = { title: "Permissions" };

export default async function PermissionsPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "super_admin") redirect("/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("role", "admin").order("full_name");

  return (
    <PermissionsClient
      admins={(data ?? []).map((a) => ({
        id: a.id,
        name: a.full_name,
        email: a.email,
        active: a.is_active,
        permissions: (a.permissions as string[] | null) ?? [...ALL_PERMS],
      }))}
    />
  );
}
