import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, requirePerm } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getEntryPolicy, getEntryTime } from "@/lib/lock";
import { fmtDateTime, fmtTime12, fmtWeekday, todayIST } from "@/lib/utils";
import type { DashboardRow } from "@/types";
import Icon, { type IconName } from "@/components/Icons";
import {
  Badge,
  buttonCls,
  Card,
  ComplianceBar,
  Notice,
  PageHeader,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import AlertsCard from "./AlertsCard";
import UnlockButton from "./UnlockButton";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic"; // always fresh (auto-lock runs server-side)

export default async function DashboardPage() {
  const profile = await requirePerm("dashboard");
  if (profile.role === "department_user") redirect("/inventory");

  const supabase = await createClient();
  const admin = isAdmin(profile.role);
  const isSuperAdmin = profile.role === "super_admin";
  const today = todayIST();

  const [dashRes, itemsRes, policy, time, settingsRes] = await Promise.all([
    // dashboard_status() also runs auto_lock_expired_entries() lazily inside the DB
    supabase.rpc("dashboard_status", { p_date: today }),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("is_active", true),
    getEntryPolicy(),
    getEntryTime(),
    supabase.from("lock_settings").select("time_lock_enabled,entry_open_time,entry_close_time").eq("id", 1).maybeSingle(),
  ]);

  const rows: DashboardRow[] = (dashRes.data ?? []) as DashboardRow[];

  // ── aggregate totals ──────────────────────────────────────────────
  const total        = rows.length;
  const completed    = rows.filter((r) => r.entry_status === "submitted").length;
  const lockedPend   = rows.filter((r) => r.entry_status === "time_locked").length;
  const missed       = rows.filter((r) => r.entry_status === "missed").length;
  const pending      = rows.filter((r) => r.entry_status === "pending" || r.entry_status === "no_entry").length;
  const unlocked     = rows.filter((r) => r.entry_status === "unlocked").length;

  // ── outlet-wise grouping ──────────────────────────────────────────
  const outletMap = new Map<string, { rows: DashboardRow[] }>();
  for (const r of rows) {
    const key = r.outlet_code || r.department_code;
    if (!outletMap.has(key)) outletMap.set(key, { rows: [] });
    outletMap.get(key)!.rows.push(r);
  }
  const outlets = [...outletMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  const settings = settingsRes.data;
  const timeEnabled = settings?.time_lock_enabled ?? false;
  const openTime = settings ? String(settings.entry_open_time).slice(0, 5) : "00:00";
  const closeTime = settings ? String(settings.entry_close_time).slice(0, 5) : "23:59";

  type KPI = { label: string; value: number; icon: IconName; tone: string };
  const kpis: KPI[] = [
    { label: "Departments", value: total,     icon: "departments", tone: "bg-sky-50 text-sky-600" },
    { label: "Completed",   value: completed, icon: "check",       tone: "bg-emerald-50 text-emerald-600" },
    { label: "Pending",     value: pending,   icon: "trail",       tone: "bg-amber-50 text-amber-600" },
    { label: "Locked–Pending", value: lockedPend, icon: "lock",   tone: "bg-purple-50 text-purple-600" },
    { label: "Missed",      value: missed,    icon: "alert",       tone: "bg-red-50 text-red-600" },
    { label: "Active Items", value: itemsRes.count ?? 0, icon: "items", tone: "bg-orange-50 text-orange-600" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${profile.full_name.split(" ")[0]}`}
        subtitle={`Today: ${fmtWeekday(today)}`}
        actions={
          <>
            {admin && can(profile, "closing") && (
              <Link href="/closing" className={buttonCls("secondary")}>
                <Icon name="table" size={16} /> Edit closing data
              </Link>
            )}
            <Link href="/inventory" className={buttonCls("primary")}>
              <Icon name="inventory" size={16} /> Open inventory
            </Link>
          </>
        }
      />

      {!policy.ready && isSuperAdmin && (
        <Notice tone="warning" icon="lock">
          <b>Entry Lock is not set up yet.</b> Run{" "}
          <code className="rounded bg-amber-100 px-1">supabase/migrations/001_entry_lock.sql</code> then{" "}
          <code className="rounded bg-amber-100 px-1">002_superadmin_dashboard.sql</code> once in the Supabase SQL
          Editor to enable all features.
        </Notice>
      )}

      {/* Entry schedule notice */}
      {timeEnabled && (
        <Notice tone="info" icon="clock">
          Entry schedule: <b>{fmtTime12(openTime)}</b> – <b>{fmtTime12(closeTime)}</b> (IST). Entries
          auto-lock at <b>{fmtTime12(closeTime)}</b> if not submitted.
          {time.isOpen ? (
            <span className="ml-2 font-semibold text-emerald-700">● Open now</span>
          ) : (
            <span className="ml-2 font-semibold text-red-700">● Closed now</span>
          )}
        </Notice>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{k.label}</p>
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${k.tone}`}>
                <Icon name={k.icon} size={15} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{k.value}</p>
          </Card>
        ))}
      </div>

      {/* Compliance summary bar */}
      {total > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Overall compliance — {today}</h2>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Completed ({completed})</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-400" />Locked–Pending ({lockedPend})</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />Missed ({missed})</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-200" />Pending/Not started ({pending})</span>
            </div>
          </div>
          <ComplianceBar completed={completed} lockedPending={lockedPend} missed={missed} total={total} />
          <p className="mt-2 text-xs text-slate-400">
            {total > 0 ? `${Math.round((completed / total) * 100)}% completion rate` : "No departments yet."}
          </p>
        </Card>
      )}

      {/* Alerts */}
      {admin && can(profile, "alerts") && (
        <Suspense
          fallback={
            <Card className="p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-4 h-4 w-full" />
            </Card>
          }
        >
          <AlertsCard
            date={today}
            canReview={can(profile, "closing")}
            canEdit={can(profile, "closing_edit")}
            canUnlock={can(profile, "entries_unlock")}
            canOpenEntry={can(profile, "inventory")}
          />
        </Suspense>
      )}

      {/* Outlet-wise sections */}
      {isSuperAdmin ? (
        <div className="space-y-6">
          {outlets.map(([outlet, { rows: outletRows }]) => {
            const oc = outletRows.filter((r) => r.entry_status === "submitted").length;
            const olp = outletRows.filter((r) => r.entry_status === "time_locked").length;
            const om = outletRows.filter((r) => r.entry_status === "missed").length;
            const ot = outletRows.length;
            return (
              <OutletCard
                key={outlet}
                outlet={outlet}
                rows={outletRows}
                completed={oc}
                lockedPending={olp}
                missed={om}
                total={ot}
                today={today}
                canUnlock={can(profile, "entries_unlock") || isSuperAdmin}
              />
            );
          })}
          {outlets.length === 0 && (
            <Card>
              <div className="px-5 py-12 text-center text-sm text-slate-400">No active departments found.</div>
            </Card>
          )}
        </div>
      ) : (
        /* Admin: single flat list */
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Department status</h2>
              <p className="text-xs text-slate-500">{completed} of {total} completed today</p>
            </div>
          </div>
          <div className="px-5 pt-4">
            <ProgressBar value={completed} max={total} tone="green" />
          </div>
          <DeptList rows={rows} today={today} showUnlock={false} />
        </Card>
      )}

      {/* Entry access card */}
      <Card className="h-fit p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-orange-400">
            <Icon name={policy.limitDays === null ? "unlock" : "lock"} size={18} />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">Entry access</h2>
            <p className="text-xs text-slate-500">Your date limit</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {policy.limitDays === null ? (
            <>You can open entries of <b>any date</b>. No limit applies to you.</>
          ) : policy.limitDays === 0 ? (
            <>Entry is <b>locked</b> for your account. Contact the Super Admin.</>
          ) : (
            <>You can enter or edit the last <b>{policy.limitDays} day{policy.limitDays === 1 ? "" : "s"}</b> (today included).</>
          )}
        </p>
        {time.applies && time.open && time.close && (
          <p className="mt-3 text-sm text-slate-600">
            Entry time: <b>{fmtTime12(time.open)} – {fmtTime12(time.close)}</b> (IST).{" "}
            <span className={time.isOpen ? "font-medium text-emerald-600" : "font-medium text-red-600"}>
              {time.isOpen ? "Open now." : "Closed now."}
            </span>
          </p>
        )}
      </Card>
    </div>
  );
}

/* ── Outlet section card ─────────────────────────────────────────────── */
function OutletCard({
  outlet,
  rows,
  completed,
  lockedPending,
  missed,
  total,
  today,
  canUnlock,
}: {
  outlet: string;
  rows: DashboardRow[];
  completed: number;
  lockedPending: number;
  missed: number;
  total: number;
  today: string;
  canUnlock: boolean;
}) {
  const compliancePct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">{outlet}</h2>
          <p className="text-xs text-slate-500">
            {completed}/{total} completed · {compliancePct}% compliance
          </p>
        </div>
        <div className="flex gap-2">
          {completed > 0 && <Badge tone="green">{completed} done</Badge>}
          {lockedPending > 0 && <Badge tone="purple">{lockedPending} locked</Badge>}
          {missed > 0 && <Badge tone="red">{missed} missed</Badge>}
        </div>
      </div>
      <div className="px-5 py-3">
        <ComplianceBar completed={completed} lockedPending={lockedPending} missed={missed} total={total} />
      </div>
      <DeptList rows={rows} today={today} showUnlock={canUnlock} />
    </Card>
  );
}

/* ── Department list rows ────────────────────────────────────────────── */
function DeptList({
  rows,
  today,
  showUnlock,
}: {
  rows: DashboardRow[];
  today: string;
  showUnlock: boolean;
}) {
  return (
    <ul className="divide-y divide-slate-100 px-2 py-2">
      {rows.map((row) => (
        <li key={row.department_id}>
          <div className="flex items-center gap-3 rounded-xl px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <Icon name="departments" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{row.department_name}</p>
              <p className="truncate text-xs text-slate-500">
                {row.entry_status === "submitted" && row.submitted_at
                  ? `Submitted ${fmtDateTime(row.submitted_at)}`
                  : row.entry_status === "time_locked"
                  ? `Auto-locked · ${row.filled_count}/${row.item_count} items filled`
                  : row.entry_status === "pending"
                  ? `${row.filled_count}/${row.item_count} items filled`
                  : row.entry_status === "missed"
                  ? "No entry recorded for this date"
                  : "Entry not started"}
                {row.inv_code ? ` · ${row.inv_code}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={row.entry_status} />
              {/* Unlock button for time_locked / submitted entries */}
              {showUnlock && (row.entry_status === "time_locked" || row.entry_status === "submitted") && (
                <UnlockButton
                  departmentId={row.department_id}
                  departmentName={row.department_name}
                  date={today}
                  currentStatus={row.entry_status}
                />
              )}
              <Link
                href={`/inventory?department=${row.department_id}`}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                title="Open inventory"
              >
                <Icon name="inventory" size={15} />
              </Link>
            </div>
          </div>
        </li>
      ))}
      {rows.length === 0 && (
        <li className="px-3 py-10 text-center text-sm text-slate-400">No departments.</li>
      )}
    </ul>
  );
}
