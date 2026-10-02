import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import type { QtyAlert } from "@/lib/alertTypes";

export type { QtyAlert } from "@/lib/alertTypes";

/** Flag a quantity that is this many times above / below the item's LAST closing. */
export const ALERT_RATIO = 3;
/** Fallback search depth (only used until previous_closings() exists in the database). */
const LOOKBACK_PERIODS = 10;

type Last = { q: number; date: string };

/**
 * Big changes in the closing of `date`: for every department + item the quantity is compared with the
 * LAST closing of that same item, whenever it was (yesterday, last week, last month).
 * 3x higher or 3x lower => alert. Only used on Admin / Super Admin screens.
 */
export const getAlerts = cache(async (date: string): Promise<QtyAlert[]> => {
  const supabase = await createClient();

  const [todayRes, itemRes, deptRes, prevRpc] = await Promise.all([
    supabase.from("inventory_periods").select("id, department_id, status").eq("week_start", date).eq("week_end", date),
    supabase.from("items").select("id, item_code, item_name, unit"),
    supabase.from("departments").select("id, name"),
    supabase.rpc("previous_closings", { p_date: date }),
  ]);
  const todayPeriods = todayRes.data ?? [];
  if (!todayPeriods.length) return [];

  const readEntries = async (ids: string[]) => {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
    return (
      await Promise.all(
        chunks.map((chunk) =>
          fetchAll<{ period_id: string; item_id: string; quantity: number | null }>((a, b) =>
            supabase.from("inventory_entries").select("period_id, item_id, quantity").in("period_id", chunk).order("period_id").order("item_id").range(a, b)
          )
        )
      )
    ).flat();
  };

  const todayInfo = new Map(todayPeriods.map((p) => [p.id, p]));
  const last = new Map<string, Last>();
  let entries: { period_id: string; item_id: string; quantity: number | null }[];

  if (!prevRpc.error) {
    // preferred: the database returns each item's last earlier closing (any gap, up to a year back)
    entries = await readEntries(todayPeriods.map((p) => p.id));
    for (const r of (prevRpc.data ?? []) as { department_id: string; item_id: string; prev_quantity: number | string; prev_date: string }[]) {
      last.set(`${r.department_id}|${r.item_id}`, { q: Number(r.prev_quantity), date: r.prev_date });
    }
  } else {
    // fallback: look at the department's most recent earlier closings
    const prevLists = await Promise.all(
      todayPeriods.map(async (p) => {
        const { data } = await supabase
          .from("inventory_periods")
          .select("id, department_id, week_end")
          .eq("department_id", p.department_id)
          .lt("week_end", date)
          .order("week_end", { ascending: false })
          .limit(LOOKBACK_PERIODS);
        return data ?? [];
      })
    );
    const prevPeriods = prevLists.flat();
    const prevInfo = new Map(prevPeriods.map((p) => [p.id, p]));
    const all = await readEntries([...todayPeriods.map((p) => p.id), ...prevPeriods.map((p) => p.id)]);
    entries = all.filter((e) => todayInfo.has(e.period_id));
    for (const e of all) {
      const p = prevInfo.get(e.period_id);
      if (!p || e.quantity === null) continue;
      const key = `${p.department_id}|${e.item_id}`;
      const cur = last.get(key);
      if (!cur || p.week_end > cur.date) last.set(key, { q: e.quantity, date: p.week_end });
    }
  }

  const items = new Map((itemRes.data ?? []).map((i) => [i.id, i]));
  const depts = new Map((deptRes.data ?? []).map((d) => [d.id, d.name as string]));
  const out: (QtyAlert & { score: number })[] = [];

  for (const e of entries) {
    const period = todayInfo.get(e.period_id);
    if (!period || e.quantity === null) continue;
    const prev = last.get(`${period.department_id}|${e.item_id}`);
    if (!prev || !(prev.q > 0)) continue; // nothing to compare with
    const up = e.quantity >= prev.q * ALERT_RATIO;
    const down = e.quantity <= prev.q / ALERT_RATIO;
    if (!up && !down) continue;
    const it = items.get(e.item_id);
    if (!it) continue;
    out.push({
      departmentId: period.department_id,
      departmentName: depts.get(period.department_id) ?? "",
      periodId: period.id,
      status: period.status,
      itemId: e.item_id,
      itemCode: it.item_code,
      itemName: it.item_name,
      unit: it.unit,
      quantity: e.quantity,
      previous: prev.q,
      previousDate: prev.date,
      direction: up ? "up" : "down",
      score: up ? e.quantity / prev.q : prev.q / Math.max(e.quantity, 0.001),
    });
  }
  return out.sort((a, b) => b.score - a.score).map(({ score: _score, ...a }) => a);
});
