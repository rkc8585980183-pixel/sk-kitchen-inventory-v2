"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Avatar, Badge, Button, Card, EmptyState, Field, inputCls, Notice, PageHeader, selectCls, td, th } from "@/components/ui";
import { cn, roleLabel } from "@/lib/utils";

interface UserRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: string;
  department_id: string | null;
  is_active: boolean;
  departments?: { name: string } | null;
}

const emptyForm = (dept: string) => ({ username: "", full_name: "", email: "", password: "", role: "department_user", department_id: dept });

export default function UsersClient({
  initialUsers,
  departments,
  currentRole,
  currentUserId,
}: {
  initialUsers: UserRow[];
  departments: { id: string; name: string }[];
  currentRole: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm(departments[0]?.id || ""));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", username: "", email: "", role: "department_user", department_id: "" });
  const [editError, setEditError] = useState<string | null>(null);

  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);

  const assignableRoles = currentRole === "super_admin" ? ["super_admin", "admin", "department_user"] : ["department_user"];

  const filtered = useMemo(() => {
    const s = deferred.trim().toLowerCase();
    if (!s) return initialUsers;
    return initialUsers.filter((u) => [u.username, u.full_name, u.email].some((v) => v?.toLowerCase().includes(s)));
  }, [initialUsers, deferred]);

  async function call(method: "POST" | "PATCH", body: unknown) {
    const res = await fetch("/api/admin/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, error: data.error as string | undefined };
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const r = await call("POST", form);
    setSaving(false);
    if (!r.ok) return setError(r.error ?? "Could not create user.");
    toast("User created.");
    setCreating(false);
    setForm(emptyForm(departments[0]?.id || ""));
    router.refresh();
  }

  function openEdit(u: UserRow) {
    setEditForm({
      full_name: u.full_name,
      username: u.username,
      email: u.email,
      role: u.role,
      department_id: u.department_id ?? departments[0]?.id ?? "",
    });
    setEditError(null);
    setEditUser(u);
  }

  async function handleEdit() {
    if (!editUser) return;
    setSaving(true);
    setEditError(null);
    const isSelf = editUser.id === currentUserId;
    const body: Record<string, unknown> = {
      user_id: editUser.id,
      full_name: editForm.full_name,
      username: editForm.username,
      email: editForm.email,
    };
    if (currentRole === "super_admin" && !isSelf) {
      body.role = editForm.role;
      if (editForm.role === "department_user") body.department_id = editForm.department_id;
    } else if (editUser.role === "department_user") {
      body.department_id = editForm.department_id;
    }
    const r = await call("PATCH", body);
    setSaving(false);
    if (!r.ok) return setEditError(r.error ?? "Could not update user.");
    toast("User updated.");
    setEditUser(null);
    router.refresh();
  }

  async function toggleActive(u: UserRow) {
    const r = await call("PATCH", { user_id: u.id, is_active: !u.is_active });
    if (!r.ok) return toast(r.error ?? "Failed.", "error");
    toast(u.is_active ? "User deactivated." : "User activated.");
    router.refresh();
  }

  async function handleReset() {
    if (!resetUser) return;
    if (newPassword.length < 6) return toast("Password must be at least 6 characters.", "error");
    setSaving(true);
    const r = await call("PATCH", { user_id: resetUser.id, password: newPassword });
    setSaving(false);
    if (!r.ok) return toast(r.error ?? "Failed.", "error");
    toast("Password updated.");
    setResetUser(null);
    setNewPassword("");
  }

  const roleTone = (r: string) => (r === "super_admin" ? "orange" : r === "admin" ? "blue" : "slate");

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${initialUsers.length} users`}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Create user
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="relative max-w-sm">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search name, username or email" value={search} onChange={(e) => setSearch(e.target.value)} className={cn(inputCls, "pl-9")} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className={th}>User</th>
                <th className={th}>Role</th>
                <th className={th}>Department</th>
                <th className={th}>Status</th>
                <th className={cn(th, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <div className="[&>div]:bg-slate-100 [&>div]:text-slate-600"><Avatar name={u.full_name} size={34} /></div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{u.full_name}</p>
                        <p className="truncate text-xs text-slate-500">{u.email} · @{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}><Badge tone={roleTone(u.role)}>{roleLabel(u.role)}</Badge></td>
                  <td className={td}>{u.departments?.name || "—"}</td>
                  <td className={td}><Badge tone={u.is_active ? "green" : "slate"} dot>{u.is_active ? "Active" : "Inactive"}</Badge></td>
                  <td className={cn(td, "space-x-1 text-right whitespace-nowrap")}>
                    <Button size="sm" variant="ghost" icon="pencil" onClick={() => openEdit(u)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon="key" onClick={() => setResetUser(u)}>Reset password</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>{u.is_active ? "Deactivate" : "Activate"}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon="users" title="No users found" />}
        </div>
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create user"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleCreate}>Create</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} /></Field>
          <Field label="Username"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputCls} /></Field>
        </div>
        <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></Field>
        <Field label="Password" hint="At least 6 characters"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} /></Field>
        <Field label="Role">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={selectCls}>
            {assignableRoles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </Field>
        {form.role === "department_user" && (
          <Field label="Department">
            <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={selectCls}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
      </Modal>

      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={`Edit user${editUser ? ` · @${editUser.username}` : ""}`}
        footer={
          <>
            <Button onClick={() => setEditUser(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleEdit}>Save changes</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} className={inputCls} /></Field>
          <Field label="Username"><input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} className={inputCls} /></Field>
        </div>
        <Field label="Email" hint="This is also the login email.">
          <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} />
        </Field>
        {currentRole === "super_admin" && (
          <Field label="Role" hint={editUser?.id === currentUserId ? "You cannot change your own role." : undefined}>
            <select
              value={editForm.role}
              disabled={editUser?.id === currentUserId}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              className={selectCls}
            >
              {assignableRoles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </Field>
        )}
        {editForm.role === "department_user" && (
          <Field label="Department">
            <select value={editForm.department_id} onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })} className={selectCls}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}
        {editError && <Notice tone="danger">{editError}</Notice>}
      </Modal>

      <Modal
        open={!!resetUser}
        onClose={() => setResetUser(null)}
        title={`Reset password · ${resetUser?.username ?? ""}`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setResetUser(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleReset}>Update password</Button>
          </>
        }
      >
        <Field label="New password" hint="At least 6 characters">
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} autoComplete="new-password" />
        </Field>
      </Modal>
    </div>
  );
}
