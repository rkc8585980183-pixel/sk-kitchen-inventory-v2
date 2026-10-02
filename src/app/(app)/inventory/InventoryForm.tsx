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

/* One table row. memo(): typing in one row does not re-render the other few hundred. */
const ItemRow = memo(function ItemRow({
  item,
  value,
  disabled,
  dirty,
  focus,
  onChange,
}: {
  item: Item;
  value: string;
  disabled: boolean;
  dirty: boolean;
  focus: boolean;
  onChange: (id: string, v: string) => void;
}) {
  return (
    <tr id={`item-${item.id}`} className={cn("hover:bg-slate-50/60", focus && "bg-amber-50 ring-2 ring-inset ring-amber-300")}>
      <td className="hidden px-4 py-2.5 font-mono text-xs text-slate-500 md:table-cell">{item.item_code}</td>
      <td className="px-4 py-2.5">
        <p className="text-sm font-medium text-slate-900">{item.item_name}</p>
        <p className="text-xs text-slate-500 md:hidden">
          {item.item_code}
          {item.category ? ` · ${item.category}` : ""}
        </p>
      </td>
      <td className="hidden px-4 py-2.5 text-sm text-slate-600 md:table-cell">{item.category || "—"}</td>
      <td className="hidden px-4 py-2.5 text-sm uppercase text-slate-500 md:table-cell">{item.unit}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <input
            data-qty
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            disabled={disabled}
            value={value}
            placeholder="0"
            aria-label={`Quantity for ${item.item_name}`}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => onChange(item.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-qty]:not(:disabled)"));
              all[all.indexOf(e.currentTarget) + 1]?.focus();
            }}
            className={cn(inputCls, "w-24 text-right tabular-nums sm:w-28", dirty && "border-orange-400 bg-orange-50/40")}
          />
          <span className="w-9 text-xs font-medium uppercase text-slate-500 md:hidden">{item.unit}</span>
        </div>
      </td>
    </tr>
  );
});

const AUTOSAVE_MS = 1000;

export default function InventoryForm({
  period,
  items,
  initialEntries,
  canEdit,
  canUnlock,
  focusItemId,
}: {
  period: PeriodLite;
  items: Item[];
  initialEntries: { item_id: string; quantity: number | null }[];
  canEdit: boolean;
  canUnlock: boolean;
  focusItemId?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const initial = useMemo(
    () => Object.fromEntries(initialEntries.map((e) => [e.item_id, e.quantity?.toString() ?? ""])),
    [initialEntries]
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState("");

  // Refs so the autosave timer always sees the latest values.
  const qRef = useRef(quantities);
  const sRef = useRef(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    qRef.current = quantities;
    sRef.current = saved;
  });

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  // coming from a "Big change" alert: scroll to that item
  useEffect(() => {
    if (focusItemId) document.getElementById(`item-${focusItemId}`)?.scrollIntoView({ block: "center" });
  }, [focusItemId]);

  function friendly(msg: string) {
    if (msg.includes("PERMISSION_DENIED")) return "You do not have permission for this action.";
    if (msg.includes("ENTRY_CLOSED")) return "Entry time is over. Changes are not saved now.";
    if (msg.includes("ENTRY_LOCKED")) return "This date is locked. Contact the Super Admin.";
    if (msg.includes("ENTRY_SUBMITTED")) return "This entry is already submitted and locked.";
    if (msg.includes("clear_inventory_entries")) return "Database update pending. Run the latest 001_entry_lock.sql in Supabase.";
    return msg;
  }

  /** Saves every changed row in ONE request. Returns true when nothing is left unsaved. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return true;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (running.current) await running.current;

    const q = qRef.current;
    const s = sRef.current;
    const changed = itemIds.filter((id) => (q[id] ?? "") !== (s[id] ?? ""));
    if (!changed.length) return true;
    const upIds = changed.filter((id) => (q[id] ?? "") !== "");
    const delIds = changed.filter((id) => (q[id] ?? "") === ""); // emptied fields = remove the saved entry

    const rows = upIds.map((item_id) => ({ period_id: period.id, item_id, quantity: parseFloat(q[item_id]) }));
    if (rows.some((r) => !Number.isFinite(r.quantity) || r.quantity < 0)) {
      setStatus("error");
      toast("Quantities must be numbers (0 or more).", "error");
      return false;
    }

    setStatus("saving");
    const job = (async () => {
      if (rows.length) {
        const { error } = await supabase.from("inventory_entries").upsert(rows, { onConflict: "period_id,item_id" });
        if (error) {
          setStatus("error");
          toast(friendly(error.message), "error");
          return false;
        }
      }
      if (delIds.length) {
        const { error } = await supabase.rpc("clear_inventory_entries", { p_period_id: period.id, p_item_ids: delIds });
        if (error) {
          setStatus("error");
          toast(friendly(error.message), "error");
          return false;
        }
      }
      const patch = Object.fromEntries(changed.map((id) => [id, q[id] ?? ""]));
      sRef.current = { ...sRef.current, ...patch };
      setSaved((prev) => ({ ...prev, ...patch }));
      setSavedAt(new Date());
      setStatus("idle");
      return true;
    })();
    running.current = job;
    const ok = await job;
    running.current = null;
    return ok;
  }, [canEdit, itemIds, period.id, supabase, toast]);

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  const onChange = useCallback((id: string, v: string) => {
    setQuantities((q) => ({ ...q, [id]: v }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flushRef.current();
    }, AUTOSAVE_MS);
  }, []);

  // Leaving the page / switching tab / closing: save what is pending (the entry stays a draft).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      flushRef.current();
    };
  }, []);

  const dirtyIds = useMemo(
    () => itemIds.filter((id) => (quantities[id] ?? "") !== (saved[id] ?? "")),
    [itemIds, quantities, saved]
  );
  const hasSaved = useMemo(() => itemIds.some((id) => (saved[id] ?? "") !== ""), [itemIds, saved]);
  const dirtySet = useMemo(() => new Set(dirtyIds), [dirtyIds]);
  const entered = useMemo(() => itemIds.filter((id) => (quantities[id] ?? "") !== "").length, [itemIds, quantities]);

  useEffect(() => {
    if (!dirtyIds.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.length]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category || "Uncategorized"))).sort((a, b) => a.localeCompare(b)),
    [items]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === "all" || (i.category || "Uncategorized") === category) &&
        (!s || i.item_name.toLowerCase().includes(s) || i.item_code.toLowerCase().includes(s))
    );
  }, [items, search, category]);

  async function handleSubmit() {
    setConfirmSubmit(false);
    setSubmitting(true);
    if (!(await flush())) {
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.rpc("submit_inventory", { p_period_id: period.id });
    setSubmitting(false);
    if (error) {
      toast(friendly(`Submit failed: ${error.message}`), "error");
      return;
    }
    toast("Inventory submitted and locked.");
    router.refresh();
  }

  async function handleClearAll() {
    setConfirmClear(false);
    setClearing(true);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (running.current) await running.current;
    const { error } = await supabase.rpc("clear_inventory_entries", { p_period_id: period.id });
    setClearing(false);
    if (error) {
      toast(friendly(error.message), "error");
      return;
    }
    qRef.current = {};
    sRef.current = {};
    setQuantities({});
    setSaved({});
    setStatus("idle");
    setSavedAt(new Date());
    toast("All entries cleared.");
  }

  async function handleUnlock() {
    setSubmitting(true);
    const { error } = await supabase.rpc("unlock_inventory", { p_period_id: period.id, p_reason: reason.trim() });
    setSubmitting(false);
    if (error) {
      toast(friendly(`Unlock failed: ${error.message}`), "error");
      return;
    }
    setUnlocking(false);
    setReason("");
    toast("Unlocked for editing.");
    router.refresh();
  }

  const time = savedAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

  return (
    <>
      {period.status === "submitted" && (
        <Notice tone="success" icon="lock">
          This entry is <b>submitted and locked</b>.{" "}
          {canUnlock ? "You can unlock it for editing." : "It cannot be edited again. Contact your Admin if a correction is needed."}
        </Notice>
      )}
      {period.status === "unlocked" && (
        <Notice tone="warning" icon="unlock">
          Unlocked for editing. Update the quantities and submit again.
        </Notice>
      )}

      <Card className="overflow-hidden">
        {/* toolbar */}
        <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="Search item or code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(inputCls, "pl-9")}
                aria-label="Search items"
              />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={cn(selectCls, "w-full sm:w-52")} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="ml-auto">
              <StatusBadge status={period.status} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <ProgressBar value={entered} max={items.length} tone={entered === items.length && items.length > 0 ? "green" : "orange"} />
            </div>
            <span className="text-xs font-medium tabular-nums text-slate-500">
              {entered}/{items.length} entered
            </span>
          </div>
        </div>

        {/* items table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="hidden bg-slate-50/70 md:table-header-group">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <ItemRow key={i.id} item={i} value={quantities[i.id] ?? ""} disabled={!canEdit} dirty={dirtySet.has(i.id)} focus={i.id === focusItemId} onChange={onChange} />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-slate-400">
              {items.length === 0 ? "No items are mapped to this department yet." : "No items match your search."}
            </p>
          )}
        </div>

        {/* sticky action bar */}
        <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="min-w-0 text-xs text-slate-500">
            {!canEdit ? (
              "Read only"
            ) : status === "saving" ? (
              <span className="flex items-center gap-2"><Spinner className="h-3.5 w-3.5 text-orange-500" /> Saving…</span>
            ) : status === "error" ? (
              <span className="flex items-center gap-2 text-red-600">
                Not saved
                <button onClick={() => flush()} className="font-medium underline">Retry</button>
              </span>
            ) : dirtyIds.length > 0 ? (
              <Badge tone="orange" dot>Saving soon…</Badge>
            ) : time ? (
              <span className="flex items-center gap-1.5 text-emerald-700"><Icon name="check" size={14} /> Draft saved {time}</span>
            ) : (
              "Auto-saved as a draft. It stays open until you submit."
            )}
          </div>
          <div className="ml-auto flex gap-2">
            {canEdit ? (
              <>
              <Button variant="danger" icon="trash" loading={clearing} disabled={submitting || (entered === 0 && !hasSaved)} onClick={() => setConfirmClear(true)}>
                Clear all
              </Button>
              <Button variant="primary" icon="check" loading={submitting} disabled={status === "saving" || items.length === 0} onClick={() => setConfirmSubmit(true)}>
                Submit
              </Button>
              </>
            ) : canUnlock ? (
              <Button variant="warning" icon="unlock" onClick={() => setUnlocking(true)}>
                Unlock for editing
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Modal
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Submit this entry?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmSubmit(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmit}>
              Yes, submit
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {entered} of {items.length} items have a quantity.
          {entered < items.length && <> The remaining <b>{items.length - entered}</b> are still empty.</>} After you submit, this entry is
          locked and cannot be edited again.
        </p>
      </Modal>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all quantities?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleClearAll}>
              Yes, clear all
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This removes all <b>{entered}</b> quantities entered for this date, including the ones already saved. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={unlocking}
        onClose={() => setUnlocking(false)}
        title="Unlock for editing"
        size="sm"
        footer={
          <>
            <Button onClick={() => setUnlocking(false)}>Cancel</Button>
            <Button variant="warning" loading={submitting} onClick={handleUnlock}>
              Unlock
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Reason (saved in the audit trail)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className={cn(inputCls, "h-auto py-2")}
            placeholder="e.g. Wrong quantity entered for flour"
          />
        </label>
      </Modal>
    </>
  );
}
