import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdmin } from "@/lib/auth";
import { getEntryPolicy, getEntryTime } from "@/lib/lock";
import { fmtDateTime, fmtTime12, fmtWeekday, todayIST } from "@/lib/utils";
import Icon, { type IconName } from "@/components/Icons";
import { buttonCls, Card, Notice, PageHeader, ProgressBar, StatusBadge } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const admin = isAdmin(profile.role);
  const today = todayIST();

  // All independent queries run in parallel (was: one after another).
  const [deptRes, periodRes, itemsRes, policy, time] = await Promise.all([
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("inventory_periods")
      .select("id, department_id, status, submitted_at, inv_code")
      .eq("week_start", today)
      .eq("week_end", today),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("is_active", true),
    getEntryPolicy(),
    getEntryTime(),
  ]);

  const departments = deptRes.data ?? [];
  const periods = periodRes.data ?? [];
  const rows = departments.map((d) => ({ dept: d, period: periods.find((p) => p.department_id === d.id) }));
  const submitted = rows.filter((r) => r.period?.status === "submitted").length;
  const pending = rows.length - submitted;
  
  const kpis: { label: string; value: number; icon: IconName; tone: string }[] = [
    { label: "Departments", value: departments.length, icon: "departments", tone: "bg-sky-50 text-sky-600" },
    { label: "Submitted", value: submitted, icon: "check", tone: "bg-emerald-50 text-emerald-600" },
    { label: "Pending", value: pending, icon: "trail", tone: "bg-amber-50 text-amber-600" },
    { label: "Active items", value: itemsRes.count ?? 0, icon: "items", tone: "bg-orange-50 text-orange-600" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${profile.full_name.split(" ")[0]}`}
        subtitle={`Today: ${fmtWeekday(today)}`}
        actions={
          <>
            {admin && (
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

      {!policy.ready && profile.role === "super_admin" && (
        <Notice tone="warning" icon="lock">
          <b>Entry Lock is not set up yet.</b> Run <code className="rounded bg-amber-100 px-1">supabase/migrations/001_entry_lock.sql</code> once in the Supabase SQL Editor to enable date limits.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{k.label}</p>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${k.tone}`}>
                <Icon name={k.icon} size={17} />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Department status</h2>
              <p className="text-xs text-slate-500">{submitted} of {departments.length} submitted today</p>
            </div>
          </div>
          <div className="px-5 pt-4">
            <ProgressBar value={submitted} max={departments.length} tone="green" />
          </div>
          <ul className="divide-y divide-slate-100 px-2 py-2">
            {rows.map(({ dept, period }) => (
              <li key={dept.id}>
                <Link href={admin ? `/inventory?department=${dept.id}` : "/inventory"} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                    <Icon name="departments" size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{dept.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {period?.submitted_at ? `Submitted ${fmtDateTime(period.submitted_at)}` : "Not submitted yet"}
                      {period?.inv_code ? ` · ${period.inv_code}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={period?.status ?? "pending"} />
                </Link>
              </li>
            ))}
            {rows.length === 0 && <li className="px-3 py-10 text-center text-sm text-slate-400">No departments yet.</li>}
          </ul>
        </Card>

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
              <>You can enter or edit the last <b>{policy.limitDays} day{policy.limitDays === 1 ? "" : "s"}</b> (today included). Older dates are locked and can be opened only by the Super Admin.</>
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
    </div>
  );
}
