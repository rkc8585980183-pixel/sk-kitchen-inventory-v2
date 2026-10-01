import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdmin } from "@/lib/auth";
import { getEntryPolicy, isPeriodOpen } from "@/lib/lock";
import { fetchAll } from "@/lib/fetchAll";
import { todayIST } from "@/lib/utils";
import ClosingGrid from "./ClosingGrid";

export const metadata = { title: "Closing data" };

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const params = await searchParams;
  const today = todayIST();
  let date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  if (date > today) date = today;

  const policy = await getEntryPolicy();
  const open = isPeriodOpen(policy, date);

  const [deptRes, itemRes, mappings] = await Promise.all([
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase.from("items").select("id, item_code, item_name, category, unit").eq("is_active", true),
    fetchAll<{ item_id: string; department_id: string }>((a, b) =>
      supabase.from("item_mappings").select("item_id, department_id").order("item_id").order("department_id").range(a, b)
    ),
  ]);

  let periods: { id: string; department_id: string; status: string; submitted_at: string | null }[] = [];
  let entries: { period_id: string; item_id: string; quantity: number | null }[] = [];

  if (open) {
    const { data } = await supabase
      .from("inventory_periods")
      .select("id, department_id, status, submitted_at")
      .eq("week_start", date)
      .eq("week_end", date);
    periods = data ?? [];
    const ids = periods.map((p) => p.id);
    if (ids.length) {
      entries = await fetchAll((a, b) =>
        supabase.from("inventory_entries").select("period_id, item_id, quantity").in("period_id", ids).order("period_id").order("item_id").range(a, b)
      );
    }
  }

  const items = (itemRes.data ?? []).sort((x, y) => x.item_code.localeCompare(y.item_code, undefined, { numeric: true }));

  return (
    <ClosingGrid
      date={date}
      today={today}
      minDate={policy.cutoff && policy.cutoff <= today ? policy.cutoff : undefined}
      locked={!open}
      limitDays={policy.limitDays}
      departments={deptRes.data ?? []}
      items={items}
      mappedPairs={mappings.map((m) => [m.item_id, m.department_id] as [string, string])}
      periods={periods}
      entries={entries}
    />
  );
}
