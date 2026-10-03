"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Item } from "@/types";
import Icon from "@/components/Icons";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Badge, Button, buttonCls, Card, EmptyState, Field, inputCls, Notice, PageHeader, selectCls, td, th } from "@/components/ui";
import { cn } from "@/lib/utils";

interface UploadRow {
  code: string;
  name: string;
  category: string | null;
  unit: string;
  department?: string;
}

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

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
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = deferred.trim().toLowerCase();
    if (!s) return initialItems;
    return initialItems.filter((i) => i.item_name.toLowerCase().includes(s) || i.item_code.toLowerCase().includes(s));
  }, [initialItems, deferred]);

  async function saveItem() {
    if (!editing?.item_code || !editing.item_name || !editing.unit) {
      toast("Item code, name and unit are required.", "error");
      return;
    }
    setSaving(true);
    const payload = {
      item_code: editing.item_code.trim().toUpperCase(),
      item_name: editing.item_name.trim(),
      category: editing.category?.trim() || null,
      unit: editing.unit,
    };
    const { error } = editing.id
      ? await supabase.from("items").update(payload).eq("id", editing.id)
      : await supabase.from("items").insert(payload);
    setSaving(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast(editing.id ? "Item updated." : "Item added.");
    setEditing(null);
    router.refresh();
  }

  async function toggleActive(item: Item) {
    const { error } = await supabase.from("items").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) return toast(error.message, "error");
    toast(item.is_active ? "Item deactivated." : "Item activated.");
    router.refresh();
  }

  // xlsx is ~400 KB: load it only when someone actually clicks download/upload.
  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet([
      { item_code: "ITM001", item_name: "Chocolate Filling", category: "Raw Material", unit: "KG", department: "Janakpuri" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    XLSX.writeFile(wb, "item_upload_template.xlsx");
  }

  async function exportItems() {
    const XLSX = await import("xlsx");
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
    setUploading(true);
    setSummary(null);
    const errs: string[] = [];

    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

      const unitMap = new Map(units.map((u) => [u.toLowerCase(), u]));
      const valid = new Map<string, UploadRow>();
      let skipped = 0;

      for (const row of rows) {
        const code = String(row.item_code ?? "").trim().toUpperCase();
        const name = String(row.item_name ?? "").trim();
        const rawUnit = String(row.unit ?? "").trim();
        if (!code || !name || !rawUnit) {
          skipped++;
          errs.push(`Row skipped (missing fields): ${JSON.stringify(row)}`);
          continue;
        }
        const unit = unitMap.get(rawUnit.toLowerCase());
        if (!unit) {
          skipped++;
          errs.push(`${code}: unit "${rawUnit}" not recognized. Valid units: ${units.join(", ")}`);
          continue;
        }
        valid.set(code, {
          code,
          name,
          unit,
          category: row.category ? String(row.category) : null,
          department: row.department ? String(row.department).trim() : undefined,
        });
      }

      // One read for existing items + departments (was: one query per row).
      const [existingRes, deptRes] = await Promise.all([
        supabase.from("items").select("id, item_code"),
        supabase.from("departments").select("id, name"),
      ]);
      const idByCode = new Map((existingRes.data ?? []).map((i) => [i.item_code, i.id as string]));
      const deptMap = new Map((deptRes.data ?? []).map((d) => [d.name.toLowerCase(), d.id as string]));

      const all = Array.from(valid.values());
      const toInsert = all.filter((r) => !idByCode.has(r.code));
      const toUpdate = all.filter((r) => idByCode.has(r.code));
      let created = 0;
      let updated = 0;

      // inserts: batches of 200; if a batch fails, retry row by row to report the exact bad row
      for (const batch of chunk(toInsert, 200)) {
        const payload = batch.map((r) => ({ item_code: r.code, item_name: r.name, category: r.category, unit: r.unit }));
        const { data, error } = await supabase.from("items").insert(payload).select("id, item_code");
        if (!error && data) {
          data.forEach((d) => idByCode.set(d.item_code, d.id));
          created += data.length;
          continue;
        }
        for (const p of payload) {
          const one = await supabase.from("items").insert(p).select("id, item_code").single();
          if (one.error) errs.push(`${p.item_code}: ${one.error.message}`);
          else {
            idByCode.set(one.data.item_code, one.data.id);
            created++;
          }
        }
      }

      // updates: 10 in parallel
      for (const batch of chunk(toUpdate, 10)) {
        const results = await Promise.all(
          batch.map((r) =>
            supabase.from("items").update({ item_name: r.name, category: r.category, unit: r.unit }).eq("id", idByCode.get(r.code)!)
          )
        );
        results.forEach((res, i) => {
          if (res.error) errs.push(`${batch[i].code}: ${res.error.message}`);
          else updated++;
        });
      }

      // Replace department mappings from Excel
for (const r of all) {
  if (!r.department) continue;

  const itemId = idByCode.get(r.code);
  const deptId = deptMap.get(r.department.toLowerCase());

  if (!deptId) {
    errs.push(`${r.code}: department "${r.department}" not found`);
    continue;
  }

  if (!itemId) continue;

  // Remove existing department mapping for this item
  const { error: deleteError } = await supabase
    .from("item_mappings")
    .delete()
    .eq("item_id", itemId);

  if (deleteError) {
    errs.push(`${r.code}: failed to remove old department mapping - ${deleteError.message}`);
    continue;
  }

  // Add new department mapping
  // Department mappings
// IMPORTANT: One item can belong to MULTIPLE departments.

const mappings: { item_id: string; department_id: string }[] = [];
const uploadedItemIds = new Set<string>();
const mappingKeys = new Set<string>();

for (const r of all) {
  if (!r.department) continue;

  const itemId = idByCode.get(r.code);
  const deptId = deptMap.get(r.department.trim().toLowerCase());

  if (!deptId) {
    errs.push(`${r.code}: department "${r.department}" not found`);
    continue;
  }

  if (!itemId) {
    errs.push(`${r.code}: item not found`);
    continue;
  }

  uploadedItemIds.add(itemId);

  const key = `${itemId}-${deptId}`;

  // Avoid duplicate same item + same department
  if (!mappingKeys.has(key)) {
    mappingKeys.add(key);

    mappings.push({
      item_id: itemId,
      department_id: deptId,
    });
  }
}

// Remove OLD mappings only ONCE for the uploaded items
const itemIds = Array.from(uploadedItemIds);

if (itemIds.length > 0) {
  const { error: deleteError } = await supabase
    .from("item_mappings")
    .delete()
    .in("item_id", itemIds);

  if (deleteError) {
    errs.push(`Mapping delete error: ${deleteError.message}`);
  } else {
    // Insert ALL department mappings from Excel
    for (const batch of chunk(mappings, 500)) {
      const { error: insertError } = await supabase
        .from("item_mappings")
        .insert(batch);

      if (insertError) {
        errs.push(`Mapping insert error: ${insertError.message}`);
      }
    }
  }
}

  return (
    <div>
      <PageHeader
        title="Item master"
        subtitle={`${initialItems.length} items`}
        actions={
          <>
            <Button icon="download" onClick={downloadTemplate}>Template</Button>
            <Button icon="file" onClick={exportItems}>Export</Button>
            <label className={cn(buttonCls("secondary"), "cursor-pointer", uploading && "pointer-events-none opacity-50")}>
              <Icon name="upload" size={16} /> {uploading ? "Uploading..." : "Bulk upload"}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
            </label>
            <Button variant="primary" icon="plus" onClick={() => setEditing({ item_code: "", item_name: "", category: "", unit: units[0] })}>
              Add item
            </Button>
          </>
        }
      />

      {summary && (
        <div className="mb-4">
          <Notice tone={errors.length ? "warning" : "success"} icon={errors.length ? "alert" : "check"}>
            <p className="font-medium">{summary}</p>
            {errors.length > 0 && (
              <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                {errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            )}
          </Notice>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-sm">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search by code or name" value={search} onChange={(e) => setSearch(e.target.value)} className={cn(inputCls, "pl-9")} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Name</th>
                <th className={th}>Category</th>
                <th className={th}>Unit</th>
                <th className={th}>Status</th>
                <th className={cn(th, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((i) => (
                <tr key={i.id} className="transition hover:bg-slate-50/60">
                  <td className={cn(td, "font-mono text-xs")}>{i.item_code}</td>
                  <td className={cn(td, "font-medium text-slate-900")}>{i.item_name}</td>
                  <td className={td}>{i.category || "—"}</td>
                  <td className={td}>{i.unit}</td>
                  <td className={td}>
                    <Badge tone={i.is_active ? "green" : "slate"} dot>{i.is_active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className={cn(td, "space-x-1 text-right whitespace-nowrap")}>
                    <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(i)}>Edit</Button>
                    {canDelete && (
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(i)}>
                        {i.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon="items" title="No items found">Try a different search or add a new item.</EmptyState>}
        </div>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit item" : "Add item"}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveItem}>Save</Button>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Item code">
              <input value={editing.item_code || ""} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, item_code: e.target.value })} className={inputCls} placeholder="ITM001" />
            </Field>
            <Field label="Item name">
              <input value={editing.item_name || ""} onChange={(e) => setEditing({ ...editing, item_name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Category">
              <input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={inputCls} placeholder="Optional" />
            </Field>
            <Field label="Unit">
              <select value={editing.unit || units[0]} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} className={selectCls}>
                {units.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
