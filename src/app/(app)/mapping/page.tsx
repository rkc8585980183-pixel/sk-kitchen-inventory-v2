import { createClient } from "@/lib/supabase/server";
import MappingClient from "./MappingClient";

export const metadata = { title: "Mapping" };

export default async function MappingPage() {
  const supabase = await createClient();
  const [items, departments, mappings] = await Promise.all([
    supabase.from("items").select("id, item_code, item_name").eq("is_active", true).order("item_code"),
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase.from("item_mappings").select("item_id, department_id"),
  ]);

  return <MappingClient items={items.data ?? []} departments={departments.data ?? []} initialMappings={mappings.data ?? []} />;
}
