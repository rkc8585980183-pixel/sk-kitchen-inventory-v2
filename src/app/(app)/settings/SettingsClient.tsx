"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, cn, fmtDay, fmtTime12, fmtWeekday } from "@/lib/utils";
import { describeSchedule, isClosingDate, nextClosingAfter, WEEKDAYS, type ClosingMode, type ClosingSchedule } from "@/lib/closingSchedule";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, EmptyState, Field, inputCls, Notice, PageHeader } from "@/components/ui";

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
  const preview = !enabled || days === null ? "Any date" : days === 0 ? "Fully locked" : `From ${fmtDay(addDays(today, -(days - 1)), true)}`;

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

export default function SettingsClient({
  ready,
  today,
  closing,
  time,
  settings,
  departments,
  admins,
}: {
  ready: boolean;
  today: string;
  closing: ClosingSchedule;
  time: { enabled: boolean; open: string; close: string };
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
  const [cMode, setCMode] = useState<ClosingMode>(closing.mode);
  const [cTime, setCTime] = useState(closing.time);
  const [cWeekday, setCWeekday] = useState(closing.weekday);
  const [cRule, setCRule] = useState<"month_end" | "day">(closing.monthRule);
  const [cDay, setCDay] = useState(closing.monthDay);
  const [timeOn, setTimeOn] = useState(time.enabled);
  const [openT, setOpenT] = useState(time.open);
  const [closeT, setCloseT] = useState(time.close);
  const [saving, setSaving] = useState(false);

  // Snapshot of what is saved, to detect changes.
  const [baseline, setBaseline] = useState(() => JSON.stringify({ enabled, defDept, defAdmin, deptL, adminL, timeOn, openT, closeT, cMode, cTime, cWeekday, cRule, cDay }));
  const current = JSON.stringify({ enabled, defDept, defAdmin, deptL, adminL, timeOn, openT, closeT, cMode, cTime, cWeekday, cRule, cDay });
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
        closing_mode: cMode,
        closing_time: cTime,
        closing_weekday: cWeekday,
        closing_month_rule: cRule,
        closing_month_day: cDay,
        time_lock_enabled: timeOn,
        entry_open_time: openT,
        entry_close_time: closeT,
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
        title="Settings"
        subtitle="Control when departments can enter inventory and how many days of entries stay open."
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

      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Closing schedule</p>
      <Card className="mb-8 p-5">
        <h2 className="font-semibold text-slate-900">Closing manager</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose when departments must enter their closing stock. Departments only see the dates that match this schedule and cannot change it.
        </p>

        <div className="mt-4 inline-flex flex-wrap rounded-xl bg-slate-100 p-1" role="group" aria-label="Closing type">
          {([["off", "Off"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setCMode(m)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                cMode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {cMode !== "off" && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Closing time (India time)" hint="The closing entry opens at this time on the closing date.">
              <input type="time" value={cTime} onChange={(e) => e.target.value && setCTime(e.target.value)} className={inputCls} />
            </Field>
            {cMode === "weekly" && (
              <Field label="Closing day" hint="Repeats automatically every week.">
                <select value={cWeekday} onChange={(e) => setCWeekday(parseInt(e.target.value, 10))} className={inputCls + " pr-8"}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </Field>
            )}
            {cMode === "monthly" && (
              <>
                <Field label="Monthly rule" hint="Repeats automatically every month.">
                  <select value={cRule} onChange={(e) => setCRule(e.target.value as "month_end" | "day")} className={inputCls + " pr-8"}>
                    <option value="month_end">Last day of the month</option>
                    <option value="day">A fixed day of the month</option>
                  </select>
                </Field>
                {cRule === "day" && (
                  <Field label="Day of the month" hint="A short month uses its last day.">
                    <input type="number" min={1} max={31} value={cDay} onChange={(e) => setCDay(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))} className={inputCls} />
                  </Field>
                )}
              </>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          {(() => {
            if (cMode === "off") return "Closing schedule is OFF: departments can enter any day (inside the entry lock days).";
            const sc: ClosingSchedule = { mode: cMode, time: cTime, weekday: cWeekday, monthRule: cRule, monthDay: cDay };
            const next = isClosingDate(sc, today) ? today : nextClosingAfter(sc, today);
            return `${describeSchedule(sc)}. ${next ? `Next closing: ${fmtWeekday(next)}.` : ""}`;
          })()}
        </p>
        {cMode !== "off" && (() => {
          const sc: ClosingSchedule = { mode: cMode, time: cTime, weekday: cWeekday, monthRule: cRule, monthDay: cDay };
          const list: string[] = [];
          let d = isClosingDate(sc, today) ? today : nextClosingAfter(sc, today);
          while (d && list.length < 5) {
            list.push(d);
            d = nextClosingAfter(sc, d);
          }
          return (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Upcoming closings:</span>
              {list.map((x) => (
                <Badge key={x} tone="blue">{fmtWeekday(x)}</Badge>
              ))}
            </div>
          );
        })()}
      </Card>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Entry time</p>
      <Card className="mb-8 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Daily entry time</h2>
            <p className="mt-1 text-sm text-slate-500">
              Department users can open, enter and submit inventory only between these two times. Before the opening time and after the closing time the entry is closed. Admins and Super Admin are not affected.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={timeOn}
            onClick={() => setTimeOn((v) => !v)}
            className={cn("relative h-7 w-12 shrink-0 rounded-full transition", timeOn ? "bg-orange-500" : "bg-slate-300")}
          >
            <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", timeOn ? "left-[22px]" : "left-0.5")} />
            <span className="sr-only">Limit entry to a time window</span>
          </button>
        </div>

        <div className={cn("mt-5 grid gap-4 sm:grid-cols-2", !timeOn && "pointer-events-none opacity-50")}>
          <Field label="Opens at (India time)">
            <input type="time" value={openT} onChange={(e) => e.target.value && setOpenT(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Closes at (India time)">
            <input type="time" value={closeT} onChange={(e) => e.target.value && setCloseT(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          {!timeOn
            ? "Time limit is OFF: departments can enter at any time of the day."
            : openT === closeT
            ? "Open and close time are the same, so entry stays open all day."
            : openT < closeT
            ? `Departments can enter every day from ${fmtTime12(openT)} to ${fmtTime12(closeT)}.`
            : `Overnight window: opens ${fmtTime12(openT)} and closes ${fmtTime12(closeT)} the next morning.`}
        </p>
      </Card>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Entry lock (days)</p>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">Date lock</h2>
              <p className="mt-1 text-sm text-slate-500">
                When ON, dates older than the allowed days are locked. Only the Super Admin can open them.
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
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">days</span>
                </div>
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Days include today: <b>1</b> = today only · <b>2</b> = today + yesterday · <b>7</b> = last 7 days · <b>0</b> = fully locked. Below, you can override any department or admin.
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
            <Button onClick={() => { const b = JSON.parse(baseline); setEnabled(b.enabled); setDefDept(b.defDept); setDefAdmin(b.defAdmin); setDeptL(b.deptL); setAdminL(b.adminL); setTimeOn(b.timeOn); setOpenT(b.openT); setCloseT(b.closeT); setCMode(b.cMode); setCTime(b.cTime); setCWeekday(b.cWeekday); setCRule(b.cRule); setCDay(b.cDay); }}>Discard</Button>
            <Button variant="primary" loading={saving} disabled={!ready} onClick={save}>Save changes</Button>
          </div>
        </div>
      )}
    </div>
  );
}
