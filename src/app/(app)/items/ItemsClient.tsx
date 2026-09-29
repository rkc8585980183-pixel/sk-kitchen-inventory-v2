"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Item } from "@/types";

export default function ItemsClient({
  initialItems,
  units,
  canDelete,
}: {
  initialItems: Item[];
  units: string[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = initialItems.filter(
    (i) =>
      i.item_name.toLowerCase().includes(search.toLowerCase()) ||
      i.item_code.toLowerCase().includes(search.toLowerCase())
  );

  async function saveItem() {
    if (!editing?.item_code || !editing.item_name || !editing.unit) {
      alert("Item Code, Name and Unit are required.");
      return;
    }
    const payload = {
      item_code: editing.item_code.trim().toUpperCase(),
      item_name: editing.item_name,
      category: editing.category || null,
      unit: editing.unit,
    };
    const { error } = editing.id
      ? await supabase.from("items").update(payload).eq("id", editing.id)
      : await supabase.from("items").insert(payload);

    if (error) {
      alert(error.message);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function toggleActive(item: Item) {
    await supabase.from("items").update({ is_active: !item.is_active }).eq("id", item.id);
    router.refresh();
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { item_code: "ITM001", item_name: "Chocolate Filling", category: "Raw Material", unit: "KG", department: "Janakpuri" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, "item_upload_template.xlsx");
  }

  function exportItems() {
    const ws = XLSX.utils.json_to_sheet(
      initialItems.map((i) => ({
        item_code: i.item_code,
        item_name: i.item_name,
        category: i.category,
        unit: i.unit,
        status: i.is_active ? "Active" : "Inactive",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, "items_export.xlsx");
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    let created = 0,
      updated = 0,
      skipped = 0;
    const errors: string[] = [];

    const { data: existingDepts } = await supabase.from("departments").select("id, name");
    const deptMap = new Map((existingDepts || []).map((d) => [d.name.toLowerCase(), d.id]));
    const unitMap = new Map(units.map((u) => [u.toLowerCase(), u]));

    for (const row of rows) {
      const code = String(row.item_code || "").trim().toUpperCase();
      const name = String(row.item_name || "").trim();
      const rawUnit = String(row.unit || "").trim();
      const unit = unitMap.get(rawUnit.toLowerCase());

      if (!code || !name || !rawUnit) {
        skipped++;
        errors.push(`Row skipped (missing fields): ${JSON.stringify(row)}`);
        continue;
      }
      if (!unit) {
        skipped++;
        errors.push(`${code}: unit "${rawUnit}" not recognized. Valid units: ${units.join(", ")}`);
        continue;
      }
      const { data: existing } = await supabase
        .from("items")
        .select("id")
        .eq("item_code", code)
        .maybeSingle();

      let itemId = existing?.id;
      if (existing) {
        const { error } = await supabase
          .from("items")
          .update({ item_name: name, category: row.category || null, unit })
          .eq("id", existing.id);
        if (error) {
          errors.push(`${code}: ${error.message}`);
          continue;
        }
        updated++;
      } else {
        const { data: inserted, error } = await supabase
          .from("items")
          .insert({ item_code: code, item_name: name, category: row.category || null, unit })
          .select("id")
          .single();
        if (error) {
          errors.push(`${code}: ${error.message}`);
          continue;
        }
        itemId = inserted.id;
        created++;
      }

      if (row.department && itemId) {
        const deptId = deptMap.get(String(row.department).trim().toLowerCase());
        if (deptId) {
          await supabase
            .from("item_mappings")
            .upsert({ item_id: itemId, department_id: deptId }, { onConflict: "item_id,department_id" });
        } else {
          errors.push(`${code}: department "${row.department}" not found`);
        }
      }
    }

    setUploadSummary(
      `Created: ${created}, Updated: ${updated}, Skipped: ${skipped}${
        errors.length ? `, Errors: ${errors.length}` : ""
      }`
    );
    setUploadErrors(errors);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Item Master</h1>
          <p className="text-sm text-gray-500">{initialItems.length} items</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            Download Template
          </button>
          <button onClick={exportItems} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            Export Excel
          </button>
          <label className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 cursor-pointer">
            Bulk Upload
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
          </label>
          <button
            onClick={() => setEditing({ item_code: "", item_name: "", category: "", unit: units[0] })}
            className="px-3 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600"
          >
            + Add Item
          </button>
        </div>
      </div>

      {uploadSummary && (
        <div className="bg-blue-50 text-blue-700 text-sm rounded-lg px-4 py-2 space-y-1">
          <p>{uploadSummary}</p>
          {uploadErrors.length > 0 && (
            <ul className="text-xs text-blue-600 list-disc pl-5 max-h-40 overflow-y-auto">
              {uploadErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input
        placeholder="Search by code or name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border border-gray-300 rounded-lg text-sm px-3 py-2 w-64"
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
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
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${i.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {i.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2 space-x-2">
                  <button onClick={() => setEditing(i)} className="text-orange-600 text-xs font-medium">
                    Edit
                  </button>
                  {canDelete && (
                    <button onClick={() => toggleActive(i)} className="text-gray-500 text-xs font-medium">
                      {i.is_active ? "Deactivate" : "Activate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-3">
            <h2 className="font-semibold text-gray-900">{editing.id ? "Edit Item" : "Add Item"}</h2>
            <input
              placeholder="Item Code"
              value={editing.item_code || ""}
              disabled={!!editing.id}
              onChange={(e) => setEditing({ ...editing, item_code: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
            />
            <input
              placeholder="Item Name"
              value={editing.item_name || ""}
              onChange={(e) => setEditing({ ...editing, item_name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Category"
              value={editing.category || ""}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={editing.unit || units[0]}
              onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300">
                Cancel
              </button>
              <button onClick={saveItem} className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
