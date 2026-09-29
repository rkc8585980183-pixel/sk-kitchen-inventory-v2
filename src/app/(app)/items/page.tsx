import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import ItemsClient from "./ItemsClient";

export default async function ItemsPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .order("item_code");

  const { data: units } = await supabase.from("units").select("code").order("code");

  return (
    <ItemsClient
      initialItems={items || []}
      units={(units || []).map((u) => u.code)}
      canDelete={profile.role === "super_admin"}
    />
  );
}
