import { createClient } from "@/lib/supabase/server";
import { getEntryPolicy } from "@/lib/lock";
import { fmtDay } from "@/lib/utils";
import ReportsClient from "./ReportsClient";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const supabase = await createClient();
  const policy = await getEntryPolicy();

  let q = supabase
    .from("inventory_entries")
    .select(
      "quantity, items(item_code, item_name, category, unit), inventory_periods!inner(inv_code, week_start, week_end, status, departments(name))"
    )
    .order("created_at", { ascending: false })
    .limit(2000);
  // Admins with a date limit only see reports inside their allowed window.
  if (policy.cutoff) q = q.gte("inventory_periods.week_end", policy.cutoff);

  const [departments, rows] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    q,
  ]);

  return (
    <ReportsClient
      departments={departments.data ?? []}
      rows={(rows.data ?? []) as unknown as React.ComponentProps<typeof ReportsClient>["rows"]}
      limitedFrom={policy.cutoff ? fmtDay(policy.cutoff, true) : null}
    />
  );
}
