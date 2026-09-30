import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import ItemsClient from "./ItemsClient";

export const metadata = { title: "Items" };

export default async function ItemsPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const [items, units] = await Promise.all([
    supabase.from("items").select("*").order("item_code"),
    supabase.from("units").select("code").order("code"),
  ]);

  return (
    <ItemsClient
      initialItems={items.data ?? []}
      units={(units.data ?? []).map((u) => u.code)}
      canDelete={profile.role === "super_admin"}
    />
  );
}
