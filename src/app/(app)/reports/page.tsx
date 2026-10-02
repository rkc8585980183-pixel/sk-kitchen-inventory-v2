import { createClient } from "@/lib/supabase/server";
import { getEntryPolicy } from "@/lib/lock";
import { requirePerm } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDay } from "@/lib/utils";
import ReportsClient from "./ReportsClient";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const profile = await requirePerm("reports");
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

  const [departments, items, rows] = await Promise.all([
    supabase.from("departments").select("id, name, is_active").order("name"),
    supabase.from("items").select("id, item_code, item_name, category, unit, is_active").order("item_code"),
    q,
  ]);

  return (
    <ReportsClient
      departments={departments.data ?? []}
      items={items.data ?? []}
      canExport={can(profile, "reports_export")}
      today={policy.today}
      minDate={policy.cutoff && policy.cutoff <= policy.today ? policy.cutoff : undefined}
      rows={(rows.data ?? []) as unknown as React.ComponentProps<typeof ReportsClient>["rows"]}
      limitedFrom={policy.cutoff ? fmtDay(policy.cutoff, true) : null}
    />
  );
}
