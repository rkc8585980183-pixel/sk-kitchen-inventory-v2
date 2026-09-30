import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import DepartmentsClient from "./DepartmentsClient";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "super_admin") redirect("/dashboard");
  const supabase = await createClient();
  const { data: departments } = await supabase.from("departments").select("*").order("name");
  return <DepartmentsClient initialDepartments={departments ?? []} />;
}
