"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Item, InventoryPeriod } from "@/types";

export default function InventoryForm({
  period,
  items,
  initialEntries,
  canEdit,
  canUnlock,
}: {
  period: InventoryPeriod;
  items: Item[];
  initialEntries: { item_id: string; quantity: number | null }[];
  canEdit: boolean;
  canUnlock: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(initialEntries.map((e) => [e.item_id, e.quantity?.toString() ?? ""]))
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(items.map((i) => i.category || "Uncategorized")))],
    [items]
  );

  const filtered = items.filter((i) => {
    const matchesSearch =
      i.item_name.toLowerCase().includes(search.toLowerCase()) ||
      i.item_code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "all" || (i.category || "Uncategorized") === category;
    return matchesSearch && matchesCategory;
  });

  async function saveQuantity(itemId: string, value: string) {
    setQuantities((q) => ({ ...q, [itemId]: value }));
  }

  async function handleSaveAll() {
    setSaving(true);
    setMessage(null);
    const rows = Object.entries(quantities)
      .filter(([, v]) => v !== "")
      .map(([item_id, v]) => ({
        period_id: period.id,
        item_id,
        quantity: parseFloat(v),
      }));

    for (const row of rows) {
      const { error } = await supabase
        .from("inventory_entries")
        .upsert(row, { onConflict: "period_id,item_id" });
      if (error) {
        setMessage(`Error saving ${row.item_id}: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setMessage("Saved.");
    router.refresh();
  }

  async function handleSubmit() {
    if (!confirm("Submit this week's inventory? It will be locked after submission.")) return;
    await handleSaveAll();
    const { error } = await supabase.rpc("submit_inventory", { p_period_id: period.id });
    if (error) {
      setMessage(`Submit failed: ${error.message}`);
      return;
    }
    router.refresh();
  }

  async function handleUnlock() {
    const reason = prompt("Reason for unlocking?") || "";
    const { error } = await supabase.rpc("unlock_inventory", {
      p_period_id: period.id,
      p_reason: reason,
    });
    if (error) {
      setMessage(`Unlock failed: ${error.message}`);
      return;
    }
    router.refresh();
  }

  const entered = Object.values(quantities).filter((v) => v !== "").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-2">
          <input
            placeholder="Search item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg text-sm px-3 py-2 w-48"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg text-sm px-3 py-2"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {entered}/{items.length} entered
          </span>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
              period.status === "submitted"
                ? "bg-green-100 text-green-700"
                : period.status === "unlocked"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {period.status}
          </span>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            <th className="px-4 py-2 font-medium">Item Code</th>
            <th className="px-4 py-2 font-medium">Item Name</th>
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-4 py-2 font-medium">Unit</th>
            <th className="px-4 py-2 font-medium w-32">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.id} className="border-b border-gray-50 last:border-0">
              <td className="px-4 py-2 text-gray-500">{i.item_code}</td>
              <td className="px-4 py-2 text-gray-900">{i.item_name}</td>
              <td className="px-4 py-2 text-gray-500">{i.category || "-"}</td>
              <td className="px-4 py-2 text-gray-500">{i.unit}</td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!canEdit}
                  value={quantities[i.id] ?? ""}
                  onChange={(e) => saveQuantity(i.id, e.target.value)}
                  className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:bg-gray-100"
                />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                No items found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="p-4 border-t border-gray-100 flex items-center gap-3">
        {message && <span className="text-xs text-gray-500">{message}</span>}
        <div className="ml-auto flex gap-2">
          {canEdit ? (
            <>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Save Draft
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600"
              >
                Submit Inventory
              </button>
            </>
          ) : canUnlock ? (
            <button
              onClick={handleUnlock}
              className="px-4 py-2 text-sm rounded-lg border border-yellow-300 text-yellow-700 hover:bg-yellow-50"
            >
              Unlock for Editing
            </button>
          ) : (
            <span className="text-xs text-gray-400">
              Submitted and locked. Contact Admin to unlock.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
