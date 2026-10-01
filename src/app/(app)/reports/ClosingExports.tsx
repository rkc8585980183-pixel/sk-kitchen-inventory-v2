"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { addDays, cn, fmtDateTime, fmtDay } from "@/lib/utils";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, inputCls, selectCls } from "@/components/ui";

interface Dept { id: string; name: string; is_active?: boolean }
interface ItemRow { id: string; item_code: string; item_name: string; category: string | null; unit: string; is_active: boolean }
interface PeriodRow { id: string; department_id: string; week_start: string; week_end: string; status: string; submitted_at: string | null; inv_code: string }
interface EntryRow { period_id: string; item_id: string; quantity: number | null }

type Cell = string | number | null;
const STATUS: Record<string, string> = { submitted: "Submitted", pending: "Draft", unlocked: "Unlocked" };
const MAX_DAYS = 92;

const byCode = (a: ItemRow, b: ItemRow) => a.item_code.localeCompare(b.item_code, undefined, { numeric: true });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

export default function ClosingExports({
  departments,
  items,
  today,
  minDate,
}: {
  departments: Dept[];
  items: ItemRow[];
  today: string;
  minDate?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [format, setFormat] = useState<"raw" | "tabs" | "history">("raw");
  const [dept, setDept] = useState(departments[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  async function load(fromD: string, toD: string, deptId?: string) {
    let q = supabase
      .from("inventory_periods")
      .select("id, department_id, week_start, week_end, status, submitted_at, inv_code")
      .gte("week_start", fromD)
      .lte("week_end", toD)
      .order("week_start");
    if (deptId) q = q.eq("department_id", deptId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const periods = ((data ?? []) as PeriodRow[]).filter((p) => p.week_start === p.week_end); // one entry per date
    const ids = periods.map((p) => p.id);
    const entries: EntryRow[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      entries.push(
        ...(await fetchAll<EntryRow>((a, b) =>
          supabase.from("inventory_entries").select("period_id, item_id, quantity").in("period_id", chunk).order("period_id").order("item_id").range(a, b)
        ))
      );
    }
    return { periods, entries };
  }

  /** items down, departments across, for ONE date */
  function consolidated(d: string, periods: PeriodRow[], entries: EntryRow[]): Cell[][] {
    const dayPeriods = periods.filter((p) => p.week_start === d);
    const pByDept = new Map(dayPeriods.map((p) => [p.department_id, p]));
    const qty = new Map(entries.map((e) => [`${e.period_id}|${e.item_id}`, e.quantity]));
    const used = new Set(entries.map((e) => e.item_id));
    const cols = departments.filter((x) => x.is_active !== false || pByDept.has(x.id));
    const rows = items.filter((i) => i.is_active || used.has(i.id)).sort(byCode);

    const aoa: Cell[][] = [["SK Kitchen · Closing report", fmtDay(d, true)], []];
    aoa.push(["Item Code", "Item Name", "Category", "Unit", ...cols.map((c) => c.name), "Total"]);
    for (const it of rows) {
      const vals = cols.map((c) => {
        const p = pByDept.get(c.id);
        return p ? qty.get(`${p.id}|${it.id}`) ?? null : null;
      });
      const nums = vals.filter((v): v is number => typeof v === "number");
      aoa.push([it.item_code, it.item_name, it.category ?? "", it.unit, ...vals, nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) * 1000) / 1000 : null]);
    }
    aoa.push([]);
    const count = (c: Dept) => {
      const p = pByDept.get(c.id);
      return p ? entries.filter((e) => e.period_id === p.id && e.quantity !== null).length : 0;
    };
    aoa.push(["", "Items entered", "", "", ...cols.map(count), ""]);
    aoa.push(["", "Status", "", "", ...cols.map((c) => (pByDept.get(c.id) ? STATUS[pByDept.get(c.id)!.status] ?? pByDept.get(c.id)!.status : "Not started")), ""]);
    aoa.push(["", "Submitted at", "", "", ...cols.map((c) => { const s = pByDept.get(c.id)?.submitted_at; return s ? fmtDateTime(s) : ""; }), ""]);
    return aoa;
  }

  function sheetOf(XLSX: typeof import("xlsx"), aoa: Cell[][], fixed = 4) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const width = Math.max(...aoa.map((r) => r.length));
    ws["!cols"] = Array.from({ length: width }, (_, i) => ({ wch: i === 1 ? 34 : i === 2 ? 20 : i < fixed ? 12 : 16 }));
    return ws;
  }

  const rawRows = (periods: PeriodRow[], entries: EntryRow[]) => {
    const pMap = new Map(periods.map((p) => [p.id, p]));
    const iMap = new Map(items.map((i) => [i.id, i]));
    return entries
      .map((e) => ({ e, p: pMap.get(e.period_id), i: iMap.get(e.item_id) }))
      .filter((x) => x.p && x.i)
      .map(({ e, p, i }) => ({
        Date: p!.week_start,
        Department: deptName.get(p!.department_id) ?? "",
        "Item Code": i!.item_code,
        "Item Name": i!.item_name,
        Category: i!.category ?? "",
        Unit: i!.unit,
        Quantity: e.quantity,
        Status: STATUS[p!.status] ?? p!.status,
        "Submitted At": p!.submitted_at ? fmtDateTime(p!.submitted_at) : "",
        "Inv Code": p!.inv_code,
      }));
  };

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  const noData = () => toast("No closing data found for this selection.", "error");

  const exportConsolidated = () =>
    run("cons", async () => {
      const { periods, entries } = await load(date, date);
      if (!periods.length) return noData();
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheetOf(XLSX, consolidated(date, periods, entries)), date);
      XLSX.writeFile(wb, `closing_${date}.xlsx`);
    });

  const exportRawDay = () =>
    run("raw", async () => {
      const { periods, entries } = await load(date, date);
      const rows = rawRows(periods, entries);
      if (!rows.length) return noData();
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Raw data");
      XLSX.writeFile(wb, `closing_raw_${date}.xlsx`);
    });

  const exportRange = () =>
    run("range", async () => {
      if (from > to) return toast("'From' date must be before 'To' date.", "error");
      if (daysBetween(from, to) > MAX_DAYS) return toast(`Choose at most ${MAX_DAYS} days (about three months).`, "error");
      const { periods, entries } = await load(from, to, format === "history" ? dept : undefined);
      if (!periods.length) return noData();
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      if (format === "raw") {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawRows(periods, entries)), "Raw data");
      } else if (format === "tabs") {
        const dates = Array.from(new Set(periods.map((p) => p.week_start))).sort();
        for (const d of dates) XLSX.utils.book_append_sheet(wb, sheetOf(XLSX, consolidated(d, periods, entries)), d);
      } else {
        // one department: items down, dates across
        const dates = Array.from(new Set(periods.map((p) => p.week_start))).sort();
        const pByDate = new Map(periods.map((p) => [p.week_start, p]));
        const qty = new Map(entries.map((e) => [`${e.period_id}|${e.item_id}`, e.quantity]));
        const used = new Set(entries.map((e) => e.item_id));
        const aoa: Cell[][] = [[`SK Kitchen · ${deptName.get(dept) ?? ""} · closing history`, `${fmtDay(from, true)} – ${fmtDay(to, true)}`], []];
        aoa.push(["Item Code", "Item Name", "Category", "Unit", ...dates.map((d) => fmtDay(d))]);
        for (const it of items.filter((i) => used.has(i.id)).sort(byCode)) {
          aoa.push([it.item_code, it.item_name, it.category ?? "", it.unit, ...dates.map((d) => qty.get(`${pByDate.get(d)!.id}|${it.id}`) ?? null)]);
        }
        aoa.push([]);
        aoa.push(["", "Status", "", "", ...dates.map((d) => STATUS[pByDate.get(d)!.status] ?? "")]);
        XLSX.utils.book_append_sheet(wb, sheetOf(XLSX, aoa), "History");
      }
      XLSX.writeFile(wb, `closing_${format}_${from}_to_${to}.xlsx`);
    });

  const box = "flex flex-col rounded-xl border border-slate-200 p-4";

  return (
    <Card className="mb-6 p-5">
      <h2 className="font-semibold text-slate-900">Closing report</h2>
      <p className="mt-1 text-sm text-slate-500">Download the daily closing in Excel. Pick a date, or a date range for several days.</p>

      <div className="mt-4 max-w-xs">
        <Field label="Closing date">
          <div className="relative">
            <Icon name="calendar" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="date" value={date} min={minDate} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={cn(inputCls, "pl-9")} />
          </div>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className={box}>
          <h3 className="text-sm font-semibold text-slate-900">Consolidated sheet</h3>
          <p className="mt-1 flex-1 text-sm text-slate-500">One date: items down and departments across, with a Total column, items entered, status and submission time.</p>
          <div className="mt-4"><Button variant="primary" icon="download" loading={busy === "cons"} onClick={exportConsolidated}>Download .xlsx</Button></div>
        </div>
        <div className={box}>
          <h3 className="text-sm font-semibold text-slate-900">Raw data</h3>
          <p className="mt-1 flex-1 text-sm text-slate-500">One line per department and item for the selected date. Good for pivot tables.</p>
          <div className="mt-4"><Button icon="download" loading={busy === "raw"} onClick={exportRawDay}>Download .xlsx</Button></div>
        </div>
      </div>

      <div className={cn(box, "mt-4")}>
        <h3 className="text-sm font-semibold text-slate-900">Date range</h3>
        <p className="mt-1 text-sm text-slate-500">Every closing between two dates in one file (up to {MAX_DAYS} days).</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From"><input type="date" value={from} min={minDate} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputCls} /></Field>
          <Field label="To"><input type="date" value={to} min={minDate} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} /></Field>
          <Field label="Format">
            <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} className={selectCls}>
              <option value="raw">Raw data (one row per count)</option>
              <option value="tabs">Consolidated (one tab per date)</option>
              <option value="history">Department history (items × dates)</option>
            </select>
          </Field>
          {format === "history" && (
            <Field label="Department">
              <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectCls}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="mt-4"><Button icon="download" loading={busy === "range"} onClick={exportRange}>Download .xlsx</Button></div>
      </div>
    </Card>
  );
}
