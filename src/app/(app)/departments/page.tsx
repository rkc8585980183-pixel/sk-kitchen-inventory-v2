import { createClient } from "@/lib/supabase/server";
import DepartmentsClient from "./DepartmentsClient";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const { data: departments } = await supabase.from("departments").select("*").order("name");
  return <DepartmentsClient initialDepartments={departments || []} />;
}
