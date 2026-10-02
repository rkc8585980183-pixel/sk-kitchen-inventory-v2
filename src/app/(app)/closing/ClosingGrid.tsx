"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, fmtDateTime, fmtWeekday } from "@/lib/utils";
import Icon from "@/components/Icons";
import Modal from "@/components/Modal";
import { AlertDialog, AlertRow } from "@/components/AlertDialog";
import type { QtyAlert } from "@/lib/alerts";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, EmptyState, inputCls, Notice, PageHeader, selectCls, Spinner, StatusBadge } from "@/components/ui";

interface Dept { id: string; name: string }
interface Item { id: string; item_code: string; item_name: string; category: string | null; unit: string }
interface Period { id: string; department_id: string; status: string; submitted_at: string | null }
interface Entry { period_id: string; item_id: string; quantity: number | null }

const k = (dept: string, item: string) => `${dept}|${item}`;

export default function ClosingGrid({
  date,
  today,
  minDate,
  locked,
  limitDays,
  canEdit,
  canUnlock,
  canOpenEntry,
  alerts,
  departments,
  items,
  mappedPairs,
  periods,
  entries,
}: {
  date: string;
  today: string;
  minDate?: string;
  locked: boolean;
  limitDays: number | null;
  canEdit: boolean;
  canUnlock: boolean;
  canOpenEntry: boolean;
  alerts: QtyAlert[];
  departments: Dept[];
  items: Item[];
  mappedPairs: [string, string][];
  periods: Period[];
  entries: Entry[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [navPending, startNav] = useTransition();

  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [value, setValue] = useState(date);
  const [unlockDept, setUnlockDept] = useState<Dept | null>(null);
  const [reason, setReason] = useState("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [activeAlert, setActiveAlert] = useState<QtyAlert | null>(null);

  useEffect(() => setValue(date), [date]);

  const periodByDept = useMemo(() => new Map(periods.map((p) => [p.department_id, p])), [periods]);
  const mapped = useMemo(() => new Set(mappedPairs.map(([i, d]) => k(d, i))), [mappedPairs]);
  const saved = useMemo(() => {
    const deptOf = new Map(periods.map((p) => [p.id, p.department_id]));
    const m: Record<string, string> = {};
    entries.forEach((e) => {
      const d = deptOf.get(e.period_id);
      if (d) m[k(d, e.item_id)] = e.quantity?.toString() ?? "";
    });
    return m;
  }, [periods, entries]);

  const alertMap = useMemo(() => new Map(alerts.map((a) => [k(a.departmentId, a.itemId), a])), [alerts]);
  const alertItems = useMemo(() => new Set(alerts.map((a) => a.itemId)), [alerts]);
  const valueOf = (d: string, i: string) => (k(d, i) in edits ? edits[k(d, i)] : saved[k(d, i)] ?? "");
  const dirtyKeys = Object.keys(edits);

  useEffect(() => {
    if (!dirtyKeys.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyKeys.length]);

  function change(d: string, i: string, v: string) {
    setEdits((prev) => {
      const next = { ...prev };
      if (v === (saved[k(d, i)] ?? "")) delete next[k(d, i)];
      else next[k(d, i)] = v;
      return next;
    });
  }

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category || "Uncategorized"))).sort(), [items]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === "all" || (i.category || "Uncategorized") === category) &&
        (!onlyAlerts || alertItems.has(i.id)) &&
        (!s || i.item_name.toLowerCase().includes(s) || i.item_code.toLowerCase().includes(s))
    );
  }, [items, search, category, onlyAlerts, alertItems]);

  function go(d: string) {
    if (!d) return;
    setEdits({});
    setEditing(false);
    startNav(() => router.push(`/closing?date=${d}`));
  }

  function friendly(msg: string) {
    if (msg.includes("PERMISSION_DENIED")) return "You do not have permission for this action.";
    if (msg.includes("ENTRY_LOCKED")) return "This date is locked for your account.";
    if (msg.includes("admin_save_entries")) return "Database update pending. Run the latest 001_entry_lock.sql in Supabase.";
    return msg;
  }

  async function save() {
    const byDept = new Map<string, { item_id: string; quantity: number | null }[]>();
    for (const key of dirtyKeys) {
      const [d, i] = key.split("|");
      const raw = edits[key];
      const q = raw === "" ? null : parseFloat(raw);
      if (q !== null && (!Number.isFinite(q) || q < 0)) {
        toast("Quantities must be numbers (0 or more).", "error");
        return;
      }
      if (!byDept.has(d)) byDept.set(d, []);
      byDept.get(d)!.push({ item_id: i, quantity: q });
    }
    setSaving(true);
    const results = await Promise.all(
      Array.from(byDept).map(async ([d, rows]) => ({
        d,
        error: (await supabase.rpc("admin_save_entries", { p_department_id: d, p_date: date, p_rows: rows })).error,
      }))
    );
    setSaving(false);

    const failed = results.find((r) => r.error);
    // keep unsaved edits only for departments that failed
    const okDepts = new Set(results.filter((r) => !r.error).map((r) => r.d));
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !okDepts.has(key.split("|")[0]))));
    if (failed?.error) {
      toast(friendly(failed.error.message), "error");
    } else {
      toast(`Saved ${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"}.`);
      setEditing(false);
    }
    router.refresh();
  }

  async function unlock() {
    const p = unlockDept && periodByDept.get(unlockDept.id);
    if (!p) return;
    setSaving(true);
    const { error } = await supabase.rpc("unlock_inventory", { p_period_id: p.id, p_reason: reason.trim() });
    setSaving(false);
    if (error) return toast(friendly(error.message), "error");
    toast(`${unlockDept?.name} entry opened for editing.`);
    setUnlockDept(null);
    setReason("");
    router.refresh();
  }

  const th = "border-b border-slate-200 bg-slate-50 px-3 py-3 text-left align-bottom text-xs font-medium uppercase tracking-wide text-slate-500";
  const total = (i: string) => {
    let t = 0;
    let any = false;
    departments.forEach((d) => {
      const v = parseFloat(valueOf(d.id, i));
      if (Number.isFinite(v)) {
        t += v;
        any = true;
      }
    });
    return any ? Math.round(t * 1000) / 1000 : null;
  };

  return (
    <div className="pb-20">
      <PageHeader
        title="Closing data"
        subtitle={`All departments · ${fmtWeekday(date)}`}
        actions={
          !locked && canEdit && (
            <Button variant={editing ? "secondary" : "primary"} icon={editing ? "x" : "pencil"} onClick={() => (editing ? (setEdits({}), setEditing(false)) : setEditing(true))}>
              {editing ? "Cancel editing" : "Edit data"}
            </Button>
          )
        }
      />

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full sm:w-52">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Closing date</span>
            <div className="relative">
              <Icon name="calendar" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={value}
                min={minDate}
                max={today}
                onChange={(e) => {
                  setValue(e.target.value);
                  go(e.target.value);
                }}
                className={cn(inputCls, "pl-9")}
              />
            </div>
          </label>
          <Button onClick={() => go(today)} disabled={date === today}>Today</Button>
          {navPending && <Spinner className="mb-3 text-orange-500" />}
        </div>
      </Card>

      {locked ? (
        <Card>
          <EmptyState icon="lock" title="This date is locked">
            {limitDays === 0 ? "Entry is locked for your account." : `You can open only the last ${limitDays ?? ""} day(s). The Super Admin can open any date.`}
          </EmptyState>
        </Card>
      ) : (
        <>
        {alerts.length > 0 && (
          <div className="mb-5">
            <Notice tone="warning" icon="alert">
              <p className="font-medium">{alerts.length} big change{alerts.length === 1 ? "" : "s"} found (3× higher or lower than the last closing). Click one to open it.</p>
              <ul className="mt-2 divide-y divide-amber-100 rounded-xl bg-white/70">
                {alerts.slice(0, 6).map((a) => (
                  <li key={a.departmentId + a.itemId}>
                    <AlertRow a={a} onOpen={setActiveAlert} />
                  </li>
                ))}
                {alerts.length > 6 && <li className="px-3 py-2 text-xs text-slate-500">and {alerts.length - 6} more (tick &quot;Only alerts&quot; below)</li>}
              </ul>
            </Notice>
          </div>
        )}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Search item or code" value={search} onChange={(e) => setSearch(e.target.value)} className={cn(inputCls, "pl-9")} />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={cn(selectCls, "w-full sm:w-52")} aria-label="Category">
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {alerts.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
                Only alerts ({alerts.length})
              </label>
            )}
            {editing && <Badge tone="orange" dot>Editing</Badge>}
          </div>

          {editing && (
            <div className="border-b border-slate-100 p-4">
              <Notice tone="warning" icon="pencil">
                You are editing closing quantities. Changes also apply to submitted entries. Leave a box empty to remove that quantity.
              </Notice>
            </div>
          )}

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className={cn(th, "sticky left-0 z-30 min-w-[220px]")}>Item</th>
                  <th className={th}>Unit</th>
                  {departments.map((d) => {
                    const p = periodByDept.get(d.id);
                    return (
                      <th key={d.id} className={cn(th, "min-w-[150px] normal-case tracking-normal")}>
                        <p className="text-sm font-semibold text-slate-900">{d.name}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {p ? <StatusBadge status={p.status} /> : <Badge>Not started</Badge>}
                        </div>
                        {p?.submitted_at && <p className="mt-1 text-[11px] font-normal text-slate-500">{fmtDateTime(p.submitted_at)}</p>}
                        <div className="mt-2 flex gap-1.5">
                          {canUnlock && p?.status === "submitted" && (
                            <Button size="sm" variant="warning" icon="unlock" onClick={() => setUnlockDept(d)}>Open</Button>
                          )}
                          <Link
                            href={`/inventory?department=${d.id}&date=${date}`}
                            className="inline-flex h-8 items-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Entry
                          </Link>
                        </div>
                      </th>
                    );
                  })}
                  <th className={cn(th, "text-right")}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const t = total(i.id);
                  return (
                    <tr key={i.id} className="group">
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2 group-hover:bg-slate-50">
                        <p className="text-sm font-medium text-slate-900">{i.item_name}</p>
                        <p className="text-xs text-slate-500">{i.item_code}{i.category ? ` · ${i.category}` : ""}</p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2 text-xs uppercase text-slate-500 group-hover:bg-slate-50">{i.unit}</td>
                      {departments.map((d) => {
                        const isMapped = mapped.has(k(d.id, i.id));
                        const v = valueOf(d.id, i.id);
                        const dirty = k(d.id, i.id) in edits;
                        const alert = !dirty ? alertMap.get(k(d.id, i.id)) : undefined;
                        return (
                          <td key={d.id} className={cn("border-b border-slate-100 px-3 py-1.5 group-hover:bg-slate-50", alert && "bg-amber-50")}>
                            {!isMapped ? (
                              <span className="text-slate-300">—</span>
                            ) : editing ? (
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                value={v}
                                placeholder="0"
                                onWheel={(e) => e.currentTarget.blur()}
                                onChange={(e) => change(d.id, i.id, e.target.value)}
                                aria-label={`${i.item_name} · ${d.name}`}
                                className={cn(inputCls, "h-9 w-28 text-right tabular-nums", dirty && "border-orange-400 bg-orange-50/50")}
                              />
                            ) : (
                              <span className={cn("tabular-nums", v === "" ? "text-slate-300" : "font-medium text-slate-900")}>{v === "" ? "–" : v}</span>
                            )}
                            {isMapped && alert && (
                              <button
                                onClick={() => setActiveAlert(alert)}
                                title="Big change. Click to open."
                                className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
                              >
                                <Icon name="alert" size={12} /> {alert.direction === "up" ? "↑" : "↓"} was {alert.previous}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-100 px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-700 group-hover:bg-slate-50">{t ?? "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="px-5 py-12 text-center text-sm text-slate-400">No items match.</p>}
          </div>
        </Card>
        </>
      )}

      {editing && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 lg:px-4">
            <span className="text-sm text-slate-500">{dirtyKeys.length ? `${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"} not saved` : "No changes yet"}</span>
            <Button onClick={() => { setEdits({}); setEditing(false); }}>Cancel</Button>
            <Button variant="primary" icon="check" loading={saving} disabled={!dirtyKeys.length} onClick={save}>Save changes</Button>
          </div>
        </div>
      )}

      <AlertDialog alert={activeAlert} date={date} canEdit={canEdit} canUnlock={canUnlock} canOpenEntry={canOpenEntry} onClose={() => setActiveAlert(null)} />

      <Modal
        open={!!unlockDept}
        onClose={() => setUnlockDept(null)}
        title={`Open ${unlockDept?.name ?? ""} entry`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setUnlockDept(null)}>Cancel</Button>
            <Button variant="warning" loading={saving} onClick={unlock}>Open for editing</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This reopens the submitted entry so the department can edit and submit it again.</p>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Reason (saved in the audit trail)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={cn(inputCls, "h-auto py-2")} placeholder="e.g. Wrong closing count" />
        </label>
      </Modal>
    </div>
  );
}
