"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, cn, fmtDay } from "@/lib/utils";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, EmptyState, inputCls, Notice, PageHeader } from "@/components/ui";

type Mode = "default" | "custom" | "none";
interface Limit { mode: Mode; days: number }
interface Target { id: string; name: string; sub: string; back_days: number | null; active: boolean }

const toLimit = (v: number | null, fallback: number): Limit =>
  v === null ? { mode: "default", days: fallback } : v === -1 ? { mode: "none", days: fallback } : { mode: "custom", days: v };
const toValue = (l: Limit): number | null => (l.mode === "default" ? null : l.mode === "none" ? -1 : l.days);
const clampDays = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(3650, Math.round(n))) : 0);

function LimitRow({
  target,
  limit,
  defaultDays,
  today,
  enabled,
  onChange,
}: {
  target: Target;
  limit: Limit;
  defaultDays: number;
  today: string;
  enabled: boolean;
  onChange: (l: Limit) => void;
}) {
  const days = limit.mode === "default" ? defaultDays : limit.mode === "custom" ? limit.days : null;
  const preview = !enabled || days === null ? "Any date" : `From ${fmtDay(addDays(today, -days), true)}`;

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {target.name} {!target.active && <Badge className="ml-1">Inactive</Badge>}
        </p>
        <p className="truncate text-xs text-slate-500">{target.sub}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Limit type">
          {([["default", "Default"], ["custom", "Custom"], ["none", "No limit"]] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => onChange({ ...limit, mode: m })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                limit.mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex h-10 w-28 items-center">
          {limit.mode === "custom" ? (
            <div className="relative w-full">
              <input
                type="number"
                min={0}
                max={3650}
                value={limit.days}
                onChange={(e) => onChange({ ...limit, days: clampDays(parseInt(e.target.value, 10)) })}
                aria-label={`Days back for ${target.name}`}
                className={cn(inputCls, "pr-11 text-right tabular-nums")}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">days</span>
            </div>
          ) : (
            <span className="px-1 text-sm tabular-nums text-slate-500">{days === null ? "∞" : `${days} days`}</span>
          )}
        </div>

        <p className="w-36 text-xs text-slate-500">{preview}</p>
      </div>
    </li>
  );
}

export default function EntryLockClient({
  ready,
  today,
  settings,
  departments,
  admins,
}: {
  ready: boolean;
  today: string;
  settings: { enabled: boolean; default_department_days: number; default_admin_days: number };
  departments: Target[];
  admins: Target[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [defDept, setDefDept] = useState(settings.default_department_days);
  const [defAdmin, setDefAdmin] = useState(settings.default_admin_days);
  const [deptL, setDeptL] = useState<Record<string, Limit>>(() =>
    Object.fromEntries(departments.map((d) => [d.id, toLimit(d.back_days, settings.default_department_days)]))
  );
  const [adminL, setAdminL] = useState<Record<string, Limit>>(() =>
    Object.fromEntries(admins.map((a) => [a.id, toLimit(a.back_days, settings.default_admin_days)]))
  );
  const [saving, setSaving] = useState(false);

  // Snapshot of what is saved, to detect changes.
  const [baseline, setBaseline] = useState(() => JSON.stringify({ enabled, defDept, defAdmin, deptL, adminL }));
  const current = JSON.stringify({ enabled, defDept, defAdmin, deptL, adminL });
  const dirty = current !== baseline;

  const changedList = useMemo(() => {
    const base = JSON.parse(baseline) as { deptL: Record<string, Limit>; adminL: Record<string, Limit> };
    const diff = (now: Record<string, Limit>, old: Record<string, Limit>) =>
      Object.entries(now)
        .filter(([id, l]) => JSON.stringify(l) !== JSON.stringify(old[id]))
        .map(([id, l]) => ({ id, back_days: toValue(l) }));
    return { departments: diff(deptL, base.deptL), admins: diff(adminL, base.adminL) };
  }, [baseline, deptL, adminL]);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/admin/lock-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        default_department_days: defDept,
        default_admin_days: defAdmin,
        ...changedList,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast(data.error ?? "Could not save.", "error");
    setBaseline(current);
    toast("Entry lock settings saved.");
    router.refresh();
  }

  return (
    <div className="pb-24">
      <PageHeader
        title="Entry lock"
        subtitle="Control how many days back each department and admin can open or edit inventory entries."
      />

      {!ready && (
        <div className="mb-5">
          <Notice tone="warning" icon="lock">
            <p className="font-medium">One-time setup needed</p>
            <p className="mt-1">
              Open Supabase → SQL Editor and run <code className="rounded bg-amber-100 px-1">supabase/migrations/001_entry_lock.sql</code>, then reload this page.
            </p>
          </Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Date lock</h2>
              <p className="mt-1 text-sm text-slate-500">
                When ON, entries older than the allowed days are locked. Only the Super Admin can open them.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={cn("relative h-7 w-12 shrink-0 rounded-full transition", enabled ? "bg-orange-500" : "bg-slate-300")}
            >
              <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", enabled ? "left-[22px]" : "left-0.5")} />
              <span className="sr-only">Enable date lock</span>
            </button>
          </div>

          <div className={cn("mt-5 grid gap-4 sm:grid-cols-2", !enabled && "pointer-events-none opacity-50")}>
            {([
              ["Default for departments", defDept, setDefDept],
              ["Default for admins", defAdmin, setDefAdmin],
            ] as const).map(([label, value, set]) => (
              <label key={label} className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
                <div className="relative">
                  <input type="number" min={0} max={3650} value={value} onChange={(e) => set(clampDays(parseInt(e.target.value, 10)))} className={cn(inputCls, "pr-14 tabular-nums")} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">days back</span>
                </div>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            <b>0</b> = current week only · <b>7</b> = current + previous week · <b>30</b> = about a month. Below, you can override any department or admin.
          </p>
        </Card>

        <Card className="h-fit p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Icon name="shield" size={18} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Super Admin</h2>
              <Badge tone="green">No limit</Badge>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600">Super Admins can always open and manage entries of every date, even when they are locked for everyone else.</p>
        </Card>
      </div>

      <div className="mt-5 grid gap-5">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Departments</h2>
            <p className="text-xs text-slate-500">Applies to every user of that department.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {departments.map((d) => (
              <LimitRow key={d.id} target={d} limit={deptL[d.id]} defaultDays={defDept} today={today} enabled={enabled} onChange={(l) => setDeptL((s) => ({ ...s, [d.id]: l }))} />
            ))}
          </ul>
          {departments.length === 0 && <EmptyState icon="departments" title="No departments yet" />}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Admins</h2>
            <p className="text-xs text-slate-500">Limit for each admin account.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {admins.map((a) => (
              <LimitRow key={a.id} target={a} limit={adminL[a.id]} defaultDays={defAdmin} today={today} enabled={enabled} onChange={(l) => setAdminL((s) => ({ ...s, [a.id]: l }))} />
            ))}
          </ul>
          {admins.length === 0 && <EmptyState icon="users" title="No admin accounts yet">Create an admin in Users to set a limit for them.</EmptyState>}
        </Card>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 sm:px-4 lg:px-4">
            <span className="text-sm text-slate-500">You have unsaved changes</span>
            <Button onClick={() => { const b = JSON.parse(baseline); setEnabled(b.enabled); setDefDept(b.defDept); setDefAdmin(b.defAdmin); setDeptL(b.deptL); setAdminL(b.adminL); }}>Discard</Button>
            <Button variant="primary" loading={saving} disabled={!ready} onClick={save}>Save changes</Button>
          </div>
        </div>
      )}
    </div>
  );
}
