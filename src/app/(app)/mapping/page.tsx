import { createClient } from "@/lib/supabase/server";
import { requirePerm } from "@/lib/auth";
import MappingClient from "./MappingClient";

export const metadata = { title: "Mapping" };

export default async function MappingPage() {
  await requirePerm("mapping");
  const supabase = await createClient();

  const [items, departments, mappings] = await Promise.all([
    supabase
      .from("items")
      .select("id, item_code, item_name")
      .eq("is_active", true)
      .order("item_code"),
    supabase
      .from("departments")
      .select("id, name, code")
      .eq("is_active", true)
      .order("name"),
    // fetch period_type along with the mapping
    supabase
      .from("item_mappings")
      .select("item_id, department_id, period_type"),
  ]);

  return (
    <MappingClient
      items={items.data ?? []}
      departments={departments.data ?? []}
      initialMappings={(mappings.data ?? []).map((m) => ({
        item_id: m.item_id,
        department_id: m.department_id,
        period_type: m.period_type ?? "both",
      }))}
    />
  );
}
