"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Item {
  id: string;
  item_code: string;
  item_name: string;
}
interface Dept {
  id: string;
  name: string;
}

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
  const supabase = createClient();
  const [selectedItem, setSelectedItem] = useState<string>(items[0]?.id || "");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const mappedDeptIds = useMemo(
    () => new Set(initialMappings.filter((m) => m.item_id === selectedItem).map((m) => m.department_id)),
    [initialMappings, selectedItem]
  );

  const [checked, setChecked] = useState<Set<string>>(mappedDeptIds);

  function selectItem(id: string) {
    setSelectedItem(id);
    setChecked(new Set(initialMappings.filter((m) => m.item_id === id).map((m) => m.department_id)));
  }

  function toggle(deptId: string) {
    const next = new Set(checked);
    next.has(deptId) ? next.delete(deptId) : next.add(deptId);
    setChecked(next);
  }

  async function save() {
    setSaving(true);
    const currentlyMapped = new Set(initialMappings.filter((m) => m.item_id === selectedItem).map((m) => m.department_id));
    const toAdd = [...checked].filter((d) => !currentlyMapped.has(d));
    const toRemove = [...currentlyMapped].filter((d) => !checked.has(d));

    if (toAdd.length) {
      await supabase.from("item_mappings").insert(toAdd.map((department_id) => ({ item_id: selectedItem, department_id })));
    }
    for (const department_id of toRemove) {
      await supabase.from("item_mappings").delete().eq("item_id", selectedItem).eq("department_id", department_id);
    }
    setSaving(false);
    router.refresh();
  }

  const filteredItems = items.filter(
    (i) => i.item_name.toLowerCase().includes(search.toLowerCase()) || i.item_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Manage Mapping</h1>
        <p className="text-sm text-gray-500">Map items to departments so they appear automatically in inventory entry.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm md:col-span-1 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <input
              placeholder="Search item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg text-sm px-3 py-2"
            />
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {filteredItems.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => selectItem(i.id)}
                  className={`w-full text-left px-4 py-2 text-sm border-b border-gray-50 ${
                    selectedItem === i.id ? "bg-orange-50 text-orange-600" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="font-medium">{i.item_name}</div>
                  <div className="text-xs text-gray-400">{i.item_code}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm md:col-span-2 p-5">
          {items.find((i) => i.id === selectedItem) ? (
            <>
              <h2 className="font-medium text-gray-900 mb-3">
                {items.find((i) => i.id === selectedItem)?.item_name} — Mapped Departments
              </h2>
              <div className="space-y-2">
                {departments.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked.has(d.id)} onChange={() => toggle(d.id)} className="rounded" />
                    {d.name}
                  </label>
                ))}
              </div>
              <button
                onClick={save}
                disabled={saving}
                className="mt-4 px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600"
              >
                Save Mapping
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-400">Select an item.</p>
          )}
        </div>
      </div>
    </div>
  );
}
