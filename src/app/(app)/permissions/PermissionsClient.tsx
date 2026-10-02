"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PermissionPicker from "@/components/PermissionPicker";
import { useToast } from "@/components/Toast";
import { Avatar, Badge, Button, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { ALL_PERMS } from "@/lib/permissions";

interface Admin { id: string; name: string; email: string; active: boolean; permissions: string[] }

export default function PermissionsClient({ admins }: { admins: Admin[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [perms, setPerms] = useState<Record<string, string[]>>(() => Object.fromEntries(admins.map((a) => [a.id, a.permissions])));
  const [base, setBase] = useState<Record<string, string[]>>(() => Object.fromEntries(admins.map((a) => [a.id, a.permissions])));
  const [saving, setSaving] = useState<string | null>(null);

  const dirty = (id: string) => JSON.stringify(perms[id]) !== JSON.stringify(base[id]);

  async function save(id: string) {
    setSaving(id);
    const res = await fetch("/api/admin/permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id, permissions: perms[id] }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(null);
    if (!res.ok) return toast(data.error ?? "Could not save.", "error");
    setBase((b) => ({ ...b, [id]: perms[id] }));
    toast("Permissions saved.");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Permissions"
        subtitle="Choose which tabs and actions each Admin gets. Super Admin always has everything."
      />

      <div className="mb-5">
        <Notice tone="info" icon="shield">
          Tabs that are not ticked disappear from that admin&apos;s menu and cannot be opened. Departments, Settings and this Permissions page are always Super Admin only.
        </Notice>
      </div>

      {admins.length === 0 ? (
        <Card>
          <EmptyState icon="users" title="No admin accounts yet">
            Create an Admin from the Users page. You can choose their access while creating them.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-5">
          {admins.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="[&>div]:bg-slate-100 [&>div]:text-slate-600"><Avatar name={a.name} size={40} /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{a.name} {!a.active && <Badge className="ml-1">Inactive</Badge>}</p>
                  <p className="truncate text-xs text-slate-500">{a.email}</p>
                </div>
                <Badge tone="blue">{perms[a.id].length} of {ALL_PERMS.length} enabled</Badge>
                <Button variant="primary" icon="check" loading={saving === a.id} disabled={!dirty(a.id)} onClick={() => save(a.id)}>
                  Save
                </Button>
              </div>
              <div className="mt-5">
                <PermissionPicker value={perms[a.id]} onChange={(v) => setPerms((p) => ({ ...p, [a.id]: v }))} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
