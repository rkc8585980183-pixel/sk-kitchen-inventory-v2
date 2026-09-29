import { createClient } from "@/lib/supabase/server";
import MappingClient from "./MappingClient";

export default async function MappingPage() {
  const supabase = await createClient();
  const { data: items } = await supabase.from("items").select("id, item_code, item_name").eq("is_active", true).order("item_code");
  const { data: departments } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
  const { data: mappings } = await supabase.from("item_mappings").select("item_id, department_id");

  return (
    <MappingClient
      items={items || []}
      departments={departments || []}
      initialMappings={mappings || []}
    />
  );
}
