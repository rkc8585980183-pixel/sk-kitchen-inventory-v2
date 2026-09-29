"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Department } from "@/types";

export default function DepartmentsClient({ initialDepartments }: { initialDepartments: Department[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState<Partial<Department> | null>(null);

  async function save() {
    if (!editing?.name || !editing.code) {
      alert("Code and Name are required.");
      return;
    }
    const payload = { code: editing.code.toUpperCase(), name: editing.name };
    const { error } = editing.id
      ? await supabase.from("departments").update(payload).eq("id", editing.id)
      : await supabase.from("departments").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function toggleActive(d: Department) {
    await supabase.from("departments").update({ is_active: !d.is_active }).eq("id", d.id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500">{initialDepartments.length} departments</p>
        </div>
        <button
          onClick={() => setEditing({ code: "", name: "" })}
          className="px-3 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600"
        >
          + Add Department
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialDepartments.map((d) => (
              <tr key={d.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2 text-gray-500">{d.code}</td>
                <td className="px-4 py-2 text-gray-900">{d.name}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${d.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {d.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2 space-x-2">
                  <button onClick={() => setEditing(d)} className="text-orange-600 text-xs font-medium">
                    Edit
                  </button>
                  <button onClick={() => toggleActive(d)} className="text-gray-500 text-xs font-medium">
                    {d.is_active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-3">
            <h2 className="font-semibold text-gray-900">{editing.id ? "Edit Department" : "Add Department"}</h2>
            <input
              placeholder="Code (e.g. JNK)"
              value={editing.code || ""}
              onChange={(e) => setEditing({ ...editing, code: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Name"
              value={editing.name || ""}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300">
                Cancel
              </button>
              <button onClick={save} className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
