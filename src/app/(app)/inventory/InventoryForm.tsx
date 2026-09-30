"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Item, PeriodLite } from "@/types";
import Icon from "@/components/Icons";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, inputCls, Notice, ProgressBar, StatusBadge } from "@/components/ui";

/* One row. memo(): typing in one row does not re-render the other few hundred. */
const ItemRow = memo(function ItemRow({
  item,
  value,
  disabled,
  dirty,
  onChange,
}: {
  item: Item;
  value: string;
  disabled: boolean;
  dirty: boolean;
  onChange: (id: string, v: string) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{item.item_name}</p>
        <p className="truncate text-xs text-slate-500">
          {item.item_code}
          {item.category ? ` · ${item.category}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
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
          className={cn(inputCls, "h-10 w-24 text-right tabular-nums sm:w-28", dirty && "border-orange-400 bg-orange-50/40")}
        />
        <span className="w-9 text-xs font-medium uppercase text-slate-500">{item.unit}</span>
      </div>
    </li>
  );
});

export default function InventoryForm({
  period,
  items,
  initialEntries,
  canEdit,
  canUnlock,
}: {
  period: PeriodLite;
  items: Item[];
  initialEntries: { item_id: string; quantity: number | null }[];
  canEdit: boolean;
  canUnlock: boolean;
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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [saving, setSaving] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState("");

  const onChange = useCallback((id: string, v: string) => setQuantities((q) => ({ ...q, [id]: v })), []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((i) => counts.set(i.category || "Uncategorized", (counts.get(i.category || "Uncategorized") ?? 0) + 1));
    return Array.from(counts.entries());
  }, [items]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === "all" || (i.category || "Uncategorized") === category) &&
        (!s || i.item_name.toLowerCase().includes(s) || i.item_code.toLowerCase().includes(s))
    );
  }, [items, search, category]);

  // Only rows that actually changed are sent to the database.
  const dirtyIds = useMemo(
    () => items.filter((i) => (quantities[i.id] ?? "") !== "" && quantities[i.id] !== (saved[i.id] ?? "")).map((i) => i.id),
    [items, quantities, saved]
  );
  const dirtySet = useMemo(() => new Set(dirtyIds), [dirtyIds]);
  const entered = useMemo(() => items.filter((i) => (quantities[i.id] ?? "") !== "").length, [items, quantities]);

  useEffect(() => {
    if (!dirtyIds.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.length]);

  function friendly(msg: string) {
    return msg.includes("ENTRY_LOCKED") ? "This entry is locked (older than your allowed days). Contact Super Admin." : msg;
  }

  async function save(): Promise<boolean> {
    if (!dirtyIds.length) return true;
    const rows = dirtyIds.map((item_id) => ({ period_id: period.id, item_id, quantity: parseFloat(quantities[item_id]) }));
    if (rows.some((r) => Number.isNaN(r.quantity) || r.quantity < 0)) {
      toast("Quantities must be valid numbers (0 or more).", "error");
      return false;
    }
    setSaving(true);
    // ONE request for all changed rows (was: one request per row).
    const { error } = await supabase.from("inventory_entries").upsert(rows, { onConflict: "period_id,item_id" });
    setSaving(false);
    if (error) {
      toast(friendly(error.message), "error");
      return false;
    }
    setSaved((s) => ({ ...s, ...Object.fromEntries(dirtyIds.map((id) => [id, quantities[id]])) }));
    return true;
  }

  async function handleSave() {
    if (await save()) toast("Draft saved.");
  }

  async function handleSubmit() {
    setConfirmSubmit(false);
    if (!(await save())) return;
    setSaving(true);
    const { error } = await supabase.rpc("submit_inventory", { p_period_id: period.id });
    setSaving(false);
    if (error) {
      toast(friendly(`Submit failed: ${error.message}`), "error");
      return;
    }
    toast("Inventory submitted and locked.");
    router.refresh();
  }

  async function handleUnlock() {
    setSaving(true);
    const { error } = await supabase.rpc("unlock_inventory", { p_period_id: period.id, p_reason: reason.trim() });
    setSaving(false);
    if (error) {
      toast(friendly(`Unlock failed: ${error.message}`), "error");
      return;
    }
    setUnlocking(false);
    setReason("");
    toast("Unlocked for editing.");
    router.refresh();
  }

  return (
    <>
      {period.status === "submitted" && (
        <Notice tone="success" icon="lock">
          This inventory is <b>submitted and locked</b>.{" "}
          {canUnlock ? "You can unlock it for editing." : "Contact your Admin to unlock it."}
        </Notice>
      )}
      {period.status === "unlocked" && (
        <Notice tone="warning" icon="unlock">
          Unlocked for editing. Update the quantities and submit again.
        </Notice>
      )}

      <Card className="mt-5 overflow-hidden">
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
            <div className="ml-auto flex items-center gap-3">
              <StatusBadge status={period.status} />
              {dirtyIds.length > 0 && <Badge tone="orange" dot>{dirtyIds.length} unsaved</Badge>}
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

          {categories.length > 1 && (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {[["all", items.length] as const, ...categories].map(([c, n]) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                    category === c
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  {c === "all" ? "All" : c} <span className={category === c ? "text-slate-300" : "text-slate-400"}>{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* items */}
        <ul className="divide-y divide-slate-100">
          {filtered.map((i) => (
            <ItemRow key={i.id} item={i} value={quantities[i.id] ?? ""} disabled={!canEdit} dirty={dirtySet.has(i.id)} onChange={onChange} />
          ))}
          {filtered.length === 0 && (
            <li className="px-5 py-12 text-center text-sm text-slate-400">
              {items.length === 0 ? "No items are mapped to this department yet." : "No items match your search."}
            </li>
          )}
        </ul>

        {/* sticky action bar */}
        <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
          <p className="hidden text-xs text-slate-500 sm:block">
            {canEdit ? "Tip: press Enter to jump to the next item." : "Read only."}
          </p>
          <div className="ml-auto flex gap-2">
            {canEdit ? (
              <>
                <Button onClick={handleSave} loading={saving} disabled={!dirtyIds.length}>
                  Save draft
                </Button>
                <Button variant="primary" icon="check" onClick={() => setConfirmSubmit(true)} disabled={saving || items.length === 0}>
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
        title="Submit this week's inventory?"
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
          {entered < items.length && <> The remaining <b>{items.length - entered}</b> are still empty.</>} After submitting, the entry is locked until an Admin unlocks it.
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
            <Button variant="warning" loading={saving} onClick={handleUnlock}>
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
