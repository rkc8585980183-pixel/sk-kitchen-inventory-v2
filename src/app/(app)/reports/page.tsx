import { createClient } from "@/lib/supabase/server";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");
  const { data: items } = await supabase.from("items").select("id, item_code, item_name, category");

  const { data: rows } = await supabase
    .from("inventory_entries")
    .select(
      "quantity, items(item_code, item_name, category, unit), inventory_periods(inv_code, week_start, week_end, status, departments(name))"
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  return (
    <ReportsClient
      departments={departments || []}
      items={items || []}
      rows={(rows || []) as any[]}
    />
  );
}
