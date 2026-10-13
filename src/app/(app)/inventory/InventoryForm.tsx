"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Item, PeriodLite } from "@/types";
import Icon from "@/components/Icons";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, inputCls, Notice, ProgressBar, selectCls, Spinner, StatusBadge } from "@/components/ui";
import DeptHeader, { type DeptHeaderProps, type Pill } from "@/components/DeptHeader";

const BG = "#3C0618";

/* ─── dense table row ─── */
const ItemRow = memo(function ItemRow({
  item, value, disabled, dirty, focus, large, onChange,
}: {
  item: Item; value: string; disabled: boolean; dirty: boolean; focus: boolean; large: boolean;
  onChange: (id: string, v: string) => void;
}) {
  const bg = focus ? "#fffbe6" : dirty ? "#fff3cd" : "";
  return (
    <tr id={`item-${item.id}`} style={{ background: bg || undefined }}
      className={cn("transition-colors", !bg && "even:bg-[#fdf4f5]")}>
      <td className="hidden w-24 border-r border-[#f0d0d6] px-2.5 py-0.5 font-mono text-[11px] text-slate-500 md:table-cell">
        {item.item_code}
      </td>
      <td className="border-r border-[#f0d0d6] px-2.5 py-0.5">
        <p className="text-[12px] font-medium leading-snug text-slate-900">{item.item_name}</p>
        <p className="text-[10px] text-slate-400 md:hidden">{item.item_code}</p>
      </td>
      <td className="hidden w-36 border-r border-[#f0d0d6] px-2.5 py-0.5 text-[11px] text-slate-500 md:table-cell">
        {item.category || "—"}
      </td>
      <td className="hidden w-16 border-r border-[#f0d0d6] px-2.5 py-0.5 text-center text-[11px] uppercase text-slate-500 md:table-cell">
        {item.unit}
      </td>
      <td className="w-28 px-2 py-0.5 text-right">
        <input
          data-qty type="number" inputMode="decimal" min={0} step="any"
          disabled={disabled} value={value} placeholder="—"
          aria-label={`Qty for ${item.item_name}`}
          onWheel={(e) => e.currentTarget.blur()}
          onFocus={(e) => large && e.currentTarget.select()}
          onChange={(e) => onChange(item.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && !(large && (e.key === "ArrowDown" || e.key === "ArrowUp"))) return;
            e.preventDefault();
            const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-qty]:not(:disabled)"));
            const at = all.indexOf(e.currentTarget);
            all[e.key === "ArrowUp" ? at - 1 : at + 1]?.focus();
          }}
          style={dirty ? { borderColor: "#d97706", background: "#fffbeb" } : {}}
          className="h-7 w-24 rounded border border-slate-300 px-2 text-right text-[12px] font-semibold tabular-nums text-slate-900 focus:border-[#3C0618] focus:outline-none focus:ring-2 focus:ring-[#3C0618]/20 disabled:cursor-default disabled:bg-transparent disabled:opacity-60"
        />
      </td>
    </tr>
  );
});

const AUTOSAVE_MS = 1000;

export default function InventoryForm({
  period, items, initialEntries, canEdit, canUnlock, focusItemId,
  variant = "admin",
  /* dept header props (only used when variant==="department") */
  deptHeaderProps,
}: {
  period: PeriodLite;
  items: Item[];
  initialEntries: { item_id: string; quantity: number | null }[];
  canEdit: boolean;
  canUnlock: boolean;
  focusItemId?: string;
  variant?: "admin" | "department";
  deptHeaderProps?: Omit<DeptHeaderProps,
    "search"|"onSearch"|"category"|"categories"|"onCategory"|
    "entered"|"total"|"statusEl"|"saveStatusEl">;
}) {
  const large = variant === "department";
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const initial = useMemo(
    () => Object.fromEntries(initialEntries.map((e) => [e.item_id, e.quantity?.toString() ?? ""])),
    [initialEntries]
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [status, setStatus] = useState<"idle"|"saving"|"error">("idle");
  const [savedAt, setSavedAt] = useState<Date|null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState("");

  const qRef = useRef(quantities);
  const sRef = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const running = useRef<Promise<boolean>|null>(null);
  useEffect(() => { qRef.current = quantities; sRef.current = saved; });

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  useEffect(() => {
    if (focusItemId) document.getElementById(`item-${focusItemId}`)?.scrollIntoView({ block: "center" });
  }, [focusItemId]);

  function friendly(msg: string) {
    if (msg.includes("PERMISSION_DENIED")) return "You do not have permission for this action.";
    if (msg.includes("ENTRY_CLOSED")) return "Entry time is over.";
    if (msg.includes("ENTRY_LOCKED")) return "This date is locked. Contact the Super Admin.";
    if (msg.includes("ENTRY_SUBMITTED")) return "This entry is already submitted and locked.";
    if (msg.includes("clear_inventory_entries")) return "Database update pending. Run the latest 001_entry_lock.sql.";
    return msg;
  }

  const flush = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return true;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (running.current) await running.current;
    const q = qRef.current; const s = sRef.current;
    const changed = itemIds.filter((id) => (q[id] ?? "") !== (s[id] ?? ""));
    if (!changed.length) return true;
    const upIds = changed.filter((id) => (q[id] ?? "") !== "");
    const delIds = changed.filter((id) => (q[id] ?? "") === "");
    const rows = upIds.map((item_id) => ({ period_id: period.id, item_id, quantity: parseFloat(q[item_id]) }));
    if (rows.some((r) => !Number.isFinite(r.quantity) || r.quantity < 0)) {
      setStatus("error"); toast("Quantities must be numbers (0 or more).", "error"); return false;
    }
    setStatus("saving");
    const job = (async () => {
      if (rows.length) {
        const { error } = await supabase.from("inventory_entries").upsert(rows, { onConflict: "period_id,item_id" });
        if (error) { setStatus("error"); toast(friendly(error.message), "error"); return false; }
      }
      if (delIds.length) {
        const { error } = await supabase.rpc("clear_inventory_entries", { p_period_id: period.id, p_item_ids: delIds });
        if (error) { setStatus("error"); toast(friendly(error.message), "error"); return false; }
      }
      const patch = Object.fromEntries(changed.map((id) => [id, q[id] ?? ""]));
      sRef.current = { ...sRef.current, ...patch };
      setSaved((prev) => ({ ...prev, ...patch }));
      setSavedAt(new Date()); setStatus("idle"); return true;
    })();
    running.current = job; const ok = await job; running.current = null; return ok;
  }, [canEdit, itemIds, period.id, supabase, toast]);

  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });

  const onChange = useCallback((id: string, v: string) => {
    setQuantities((q) => ({ ...q, [id]: v }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), AUTOSAVE_MS);
  }, []);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushRef.current(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onHide); flushRef.current(); };
  }, []);

  const dirtyIds = useMemo(() => itemIds.filter((id) => (quantities[id] ?? "") !== (saved[id] ?? "")), [itemIds, quantities, saved]);
  const dirtySet = useMemo(() => new Set(dirtyIds), [dirtyIds]);
  const entered = useMemo(() => itemIds.filter((id) => (quantities[id] ?? "") !== "").length, [itemIds, quantities]);
  const hasSaved = useMemo(() => itemIds.some((id) => (saved[id] ?? "") !== ""), [itemIds, saved]);

  useEffect(() => {
    if (!dirtyIds.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.length]);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category || "Uncategorized"))).sort(), [items]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(
      (i) => (category === "all" || (i.category || "Uncategorized") === category) &&
             (!s || i.item_name.toLowerCase().includes(s) || i.item_code.toLowerCase().includes(s))
    );
  }, [items, search, category]);

  async function handleSaveDraft() { if (await flush()) toast("Draft saved."); }
  async function handleSubmit() {
    setConfirmSubmit(false); setSubmitting(true);
    if (!(await flush())) { setSubmitting(false); return; }
    const { error } = await supabase.rpc("submit_inventory", { p_period_id: period.id });
    setSubmitting(false);
    if (error) { toast(friendly(`Submit failed: ${error.message}`), "error"); return; }
    toast("Inventory submitted and locked."); router.refresh();
  }
  async function handleClearAll() {
    setConfirmClear(false); setClearing(true);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (running.current) await running.current;
    const { error } = await supabase.rpc("clear_inventory_entries", { p_period_id: period.id });
    setClearing(false);
    if (error) { toast(friendly(error.message), "error"); return; }
    qRef.current = {}; sRef.current = {};
    setQuantities({}); setSaved({}); setStatus("idle"); setSavedAt(new Date()); toast("All entries cleared.");
  }
  async function handleUnlock() {
    setSubmitting(true);
    const { error } = await supabase.rpc("unlock_inventory", { p_period_id: period.id, p_reason: reason.trim() });
    setSubmitting(false);
    if (error) { toast(friendly(`Unlock failed: ${error.message}`), "error"); return; }
    setUnlocking(false); setReason(""); toast("Unlocked for editing."); router.refresh();
  }

  const time = savedAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

  const saveStatusEl = !canEdit ? null
    : status === "saving" ? <span className="flex items-center gap-1"><Spinner className="h-3 w-3" />Saving…</span>
    : dirtyIds.length > 0 ? <span className="text-amber-300">●&nbsp;Saving…</span>
    : time ? <span className="text-emerald-300">✓&nbsp;{time}</span>
    : <span>Auto-save on</span>;

  /* ══════════════ DEPARTMENT PANEL ══════════════ */
  if (large) {
    const hp = deptHeaderProps!;
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        {/* ── all-in-one maroon header ── */}
        <DeptHeader
          {...hp}
          search={search} onSearch={setSearch}
          category={category} categories={categories} onCategory={setCategory}
          entered={entered} total={items.length}
          statusEl={<StatusBadge status={period.status} />}
          saveStatusEl={saveStatusEl}
        />

        {/* submitted / unlocked notice */}
        {period.status === "submitted" && (
          <div className="flex shrink-0 items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-5 py-1.5 text-xs text-emerald-800">
            <Icon name="lock" size={13} />
            <span><b>Submitted and locked.</b> {canUnlock ? "Unlock it below." : "Contact your Admin for a correction."}</span>
          </div>
        )}
        {period.status === "unlocked" && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-1.5 text-xs text-amber-800">
            <Icon name="unlock" size={13} />
            <span>Unlocked for editing. Update quantities and submit again.</span>
          </div>
        )}

        {/* ── scrollable table – fills all remaining height ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse" style={{ minWidth: 480 }}>
            <thead className="sticky top-0 z-10">
              <tr style={{ background: BG, color: "#fff" }}>
                <th className="hidden px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide md:table-cell" style={{ width: 90 }}>Code</th>
                <th className="px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide">Item Name</th>
                <th className="hidden px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide md:table-cell" style={{ width: 136 }}>Category</th>
                <th className="hidden px-2.5 py-2 text-center text-[11px] font-bold uppercase tracking-wide md:table-cell" style={{ width: 64 }}>Unit</th>
                <th className="px-2.5 py-2 text-right text-[11px] font-bold uppercase tracking-wide" style={{ width: 108 }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <ItemRow key={i.id} item={i} value={quantities[i.id] ?? ""} disabled={!canEdit}
                  dirty={dirtySet.has(i.id)} focus={i.id === focusItemId} large={true} onChange={onChange} />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-slate-400">
              {items.length === 0 ? "No items mapped to this department yet." : "No items match your search."}
            </p>
          )}
        </div>

        {/* ── fixed action bar ── */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[#e8c8cf] bg-white px-4 py-2 sm:px-5">
          {canEdit ? (
            <>
              <button onClick={handleSaveDraft} disabled={submitting || status === "saving" || dirtyIds.length === 0}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <Icon name="file" size={13} /> Save Draft
              </button>
              <button onClick={() => setConfirmClear(true)} disabled={submitting || (entered === 0 && !hasSaved)}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                {clearing ? <Spinner className="h-3.5 w-3.5 text-red-500" /> : <Icon name="trash" size={13} />}
                Clear All
              </button>
              <button onClick={() => setConfirmSubmit(true)} disabled={status === "saving" || items.length === 0 || submitting}
                className="ml-auto inline-flex h-8 items-center gap-2 rounded px-5 text-xs font-bold text-white shadow hover:opacity-90 disabled:opacity-50"
                style={{ background: BG }}>
                {submitting ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Icon name="check" size={13} />}
                Submit Closing Stock
              </button>
            </>
          ) : canUnlock ? (
            <button onClick={() => setUnlocking(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-100">
              <Icon name="unlock" size={13} /> Unlock for editing
            </button>
          ) : <span className="text-xs text-slate-400">Read only</span>}
        </div>

        {/* modals */}
        <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)} title="Submit this entry?" size="sm"
          footer={<><Button onClick={() => setConfirmSubmit(false)}>Cancel</Button><Button variant="primary" onClick={handleSubmit}>Yes, submit</Button></>}>
          <p className="text-sm text-slate-600">
            {entered} of {items.length} items have a quantity.
            {entered < items.length && <> The remaining <b>{items.length - entered}</b> are still empty.</>} After submitting, this entry is locked.
          </p>
        </Modal>
        <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear all quantities?" size="sm"
          footer={<><Button onClick={() => setConfirmClear(false)}>Cancel</Button><Button variant="danger" onClick={handleClearAll}>Yes, clear all</Button></>}>
          <p className="text-sm text-slate-600">This removes all saved quantities. It cannot be undone.</p>
        </Modal>
        <Modal open={unlocking} onClose={() => setUnlocking(false)} title="Unlock for editing" size="sm"
          footer={<><Button onClick={() => setUnlocking(false)}>Cancel</Button><Button variant="warning" loading={submitting} onClick={handleUnlock}>Unlock</Button></>}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Reason (saved in audit trail)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              className={cn(inputCls, "h-auto py-2")} placeholder="e.g. Wrong quantity entered" />
          </label>
        </Modal>
      </div>
    );
  }

  /* ══════════════ ADMIN PANEL (unchanged) ══════════════ */
  return (
    <>
      {period.status === "submitted" && (
        <Notice tone="success" icon="lock">
          This entry is <b>submitted and locked</b>.{" "}
          {canUnlock ? "You can unlock it for editing." : "It cannot be edited again. Contact your Admin if a correction is needed."}
        </Notice>
      )}
      {period.status === "unlocked" && (
        <Notice tone="warning" icon="unlock">Unlocked for editing. Update the quantities and submit again.</Notice>
      )}
      <Card className="overflow-hidden">
        <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Search item or code" value={search} onChange={(e) => setSearch(e.target.value)}
                className={cn(inputCls, "pl-9")} aria-label="Search items" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className={cn(selectCls, "w-full sm:w-52")} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="ml-auto"><StatusBadge status={period.status} /></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <ProgressBar value={entered} max={items.length} tone={entered === items.length && items.length > 0 ? "green" : "orange"} />
            </div>
            <span className="text-xs font-medium tabular-nums text-slate-500">{entered}/{items.length} entered</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="hidden bg-slate-50/70 md:table-header-group">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                {["Code","Item","Category","Unit"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                <th className="px-4 py-3 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <ItemRow key={i.id} item={i} value={quantities[i.id] ?? ""} disabled={!canEdit}
                  dirty={dirtySet.has(i.id)} focus={i.id === focusItemId} large={false} onChange={onChange} />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-slate-400">
              {items.length === 0 ? "No items are mapped to this department yet." : "No items match your search."}
            </p>
          )}
        </div>
        <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="min-w-0 text-xs text-slate-500">
            {!canEdit ? "Read only"
              : status === "saving" ? <span className="flex items-center gap-2"><Spinner className="h-3.5 w-3.5 text-orange-500" />Saving…</span>
              : status === "error" ? <span className="flex items-center gap-2 text-red-600">Not saved <button onClick={() => flush()} className="font-medium underline">Retry</button></span>
              : dirtyIds.length > 0 ? <Badge tone="orange" dot>Saving soon…</Badge>
              : time ? <span className="flex items-center gap-1.5 text-emerald-700"><Icon name="check" size={14} />Draft saved {time}</span>
              : "Auto-saved as a draft."}
          </div>
          <div className="ml-auto flex gap-2">
            {canEdit ? (
              <>
                <Button variant="danger" icon="trash" loading={clearing} disabled={submitting || (entered === 0 && !hasSaved)} onClick={() => setConfirmClear(true)}>Clear all</Button>
                <Button variant="primary" icon="check" loading={submitting} disabled={status === "saving" || items.length === 0} onClick={() => setConfirmSubmit(true)}>Submit</Button>
              </>
            ) : canUnlock ? (
              <Button variant="warning" icon="unlock" onClick={() => setUnlocking(true)}>Unlock for editing</Button>
            ) : null}
          </div>
        </div>
      </Card>
      <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)} title="Submit this entry?" size="sm"
        footer={<><Button onClick={() => setConfirmSubmit(false)}>Cancel</Button><Button variant="primary" onClick={handleSubmit}>Yes, submit</Button></>}>
        <p className="text-sm text-slate-600">
          {entered} of {items.length} items have a quantity.
          {entered < items.length && <> The remaining <b>{items.length - entered}</b> are still empty.</>} After you submit, this entry is locked.
        </p>
      </Modal>
      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear all quantities?" size="sm"
        footer={<><Button onClick={() => setConfirmClear(false)}>Cancel</Button><Button variant="danger" onClick={handleClearAll}>Yes, clear all</Button></>}>
        <p className="text-sm text-slate-600">This removes all quantities. It cannot be undone.</p>
      </Modal>
      <Modal open={unlocking} onClose={() => setUnlocking(false)} title="Unlock for editing" size="sm"
        footer={<><Button onClick={() => setUnlocking(false)}>Cancel</Button><Button variant="warning" loading={submitting} onClick={handleUnlock}>Unlock</Button></>}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Reason</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            className={cn(inputCls, "h-auto py-2")} placeholder="e.g. Wrong quantity" />
        </label>
      </Modal>
    </>
  );
}
