"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, EmptyState, inputCls, PageHeader } from "@/components/ui";

interface Item { id: string; item_code: string; item_name: string }
interface Dept { id: string; name: string }

export default function MappingClient({
  items,
  departments,
  initialMappings,
}: {
  items: Item[];
  departments: Dept[];
  initialMappings: { item_id: string; department_id: string }[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<string>(items[0]?.id || "");
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [saving, setSaving] = useState(false);

  const byItem = useMemo(() => {
    const m = new Map<string, Set<string>>();
    initialMappings.forEach((x) => {
      if (!m.has(x.item_id)) m.set(x.item_id, new Set());
      m.get(x.item_id)!.add(x.department_id);
    });
    return m;
  }, [initialMappings]);

  const [checked, setChecked] = useState<Set<string>>(new Set(byItem.get(items[0]?.id) ?? []));

  function selectItem(id: string) {
    setSelectedItem(id);
    setChecked(new Set(byItem.get(id) ?? []));
  }

  function toggle(deptId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(deptId) ? next.delete(deptId) : next.add(deptId);
      return next;
    });
  }

  const current = byItem.get(selectedItem) ?? new Set<string>();
  const changed = checked.size !== current.size || [...checked].some((d) => !current.has(d));

  async function save() {
    setSaving(true);
    const toAdd = [...checked].filter((d) => !current.has(d));
    const toRemove = [...current].filter((d) => !checked.has(d));

    const ops = [];
    if (toAdd.length) {
      ops.push(supabase.from("item_mappings").insert(toAdd.map((department_id) => ({ item_id: selectedItem, department_id }))));
    }
    if (toRemove.length) {
      // one request instead of one per department
      ops.push(supabase.from("item_mappings").delete().eq("item_id", selectedItem).in("department_id", toRemove));
    }
    const results = await Promise.all(ops);
    setSaving(false);
    const err = results.find((r) => r.error)?.error;
    if (err) return toast(err.message, "error");
    toast("Mapping saved.");
    router.refresh();
  }

  const filteredItems = useMemo(() => {
    const s = deferred.trim().toLowerCase();
    return s ? items.filter((i) => i.item_name.toLowerCase().includes(s) || i.item_code.toLowerCase().includes(s)) : items;
  }, [items, deferred]);

  const selected = items.find((i) => i.id === selectedItem);

  return (
    <div>
      <PageHeader title="Item mapping" subtitle="Choose which departments see each item in their inventory entry." />

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Search item" value={search} onChange={(e) => setSearch(e.target.value)} className={cn(inputCls, "pl-9")} />
            </div>
          </div>
          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {filteredItems.map((i) => {
              const n = byItem.get(i.id)?.size ?? 0;
              const active = selectedItem === i.id;
              return (
                <li key={i.id}>
                  <button
                    onClick={() => selectItem(i.id)}
                    className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition", active ? "bg-orange-50" : "hover:bg-slate-50")}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-medium", active ? "text-orange-700" : "text-slate-900")}>{i.item_name}</p>
                      <p className="text-xs text-slate-500">{i.item_code}</p>
                    </div>
                    <Badge tone={n ? "blue" : "slate"}>{n} dept</Badge>
                  </button>
                </li>
              );
            })}
            {filteredItems.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">No items found.</li>}
          </ul>
        </Card>

        <Card className="lg:col-span-3">
          {selected ? (
            <div className="p-5">
              <h2 className="font-semibold text-slate-900">{selected.item_name}</h2>
              <p className="text-xs text-slate-500">{selected.item_code} · mapped departments</p>

              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => setChecked(new Set(departments.map((d) => d.id)))}>Select all</Button>
                <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>Clear</Button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {departments.map((d) => {
                  const on = checked.has(d.id);
                  return (
                    <label
                      key={d.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition",
                        on ? "border-orange-300 bg-orange-50/60 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggle(d.id)} className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
                      {d.name}
                    </label>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                {changed && <span className="text-xs text-amber-600">Unsaved changes</span>}
                <Button variant="primary" loading={saving} disabled={!changed} onClick={save}>
                  Save mapping
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState icon="mapping" title="Select an item">Pick an item on the left to manage its departments.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}
