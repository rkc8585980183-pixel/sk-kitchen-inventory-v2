"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Department } from "@/types";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Badge, Button, buttonCls, Card, EmptyState, Field, inputCls, PageHeader, td, th } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function DepartmentsClient({ initialDepartments }: { initialDepartments: Department[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [editing, setEditing] = useState<Partial<Department> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing?.name?.trim() || !editing.code?.trim()) {
      toast("Code and name are required.", "error");
      return;
    }
    setSaving(true);
    const payload = { code: editing.code.trim().toUpperCase(), name: editing.name.trim() };
    const { error } = editing.id
      ? await supabase.from("departments").update(payload).eq("id", editing.id)
      : await supabase.from("departments").insert(payload);
    setSaving(false);
    if (error) return toast(error.message, "error");
    toast(editing.id ? "Department updated." : "Department added.");
    setEditing(null);
    router.refresh();
  }

  async function toggleActive(d: Department) {
    const { error } = await supabase.from("departments").update({ is_active: !d.is_active }).eq("id", d.id);
    if (error) return toast(error.message, "error");
    toast(d.is_active ? "Department deactivated." : "Department activated.");
    router.refresh();
  }

  const limitLabel = (d: Department) =>
    d.back_days == null ? <Badge>Default</Badge> : d.back_days === -1 ? <Badge tone="green">No limit</Badge> : <Badge tone="orange">{d.back_days} days</Badge>;

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle={`${initialDepartments.length} departments`}
        actions={
          <>
            <Link href="/entry-lock" className={buttonCls("secondary")}>Entry lock limits</Link>
            <Button variant="primary" icon="plus" onClick={() => setEditing({ code: "", name: "" })}>Add department</Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Name</th>
                <th className={th}>Entry limit</th>
                <th className={th}>Status</th>
                <th className={cn(th, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialDepartments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/60">
                  <td className={cn(td, "font-mono text-xs")}>{d.code}</td>
                  <td className={cn(td, "font-medium text-slate-900")}>{d.name}</td>
                  <td className={td}>{limitLabel(d)}</td>
                  <td className={td}><Badge tone={d.is_active ? "green" : "slate"} dot>{d.is_active ? "Active" : "Inactive"}</Badge></td>
                  <td className={cn(td, "space-x-1 text-right whitespace-nowrap")}>
                    <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(d)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(d)}>{d.is_active ? "Deactivate" : "Activate"}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {initialDepartments.length === 0 && <EmptyState icon="departments" title="No departments yet" />}
        </div>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit department" : "Add department"}
        size="sm"
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>Save</Button>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Code">
              <input value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} className={inputCls} placeholder="e.g. JNK" />
            </Field>
            <Field label="Name">
              <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
