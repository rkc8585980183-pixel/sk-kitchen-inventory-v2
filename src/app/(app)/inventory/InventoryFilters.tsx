"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import Icon from "@/components/Icons";
import { Badge, Card, inputCls, selectCls, Spinner } from "@/components/ui";

interface Recent {
  date: string;
  label: string;
  status: string | null;
  /** department panel: false = no closing is required on this date */
  scheduled?: boolean;
  /** department panel: outside the days the user may open */
  disabled?: boolean;
}

const dot = (status: string | null) =>
  status === "submitted"
    ? "bg-emerald-500"
    : status === "unlocked"
    ? "bg-amber-500"
    : status === "pending"
    ? "bg-orange-400"
    : "border border-slate-300 bg-white";

export default function InventoryFilters({
  departments,
  selectedDepartment,
  showDepartments,
  date,
  min,
  max,
  recent,
  variant = "admin",
  closingNote,
}: {
  departments: { id: string; name: string }[];
  selectedDepartment: string;
  showDepartments: boolean;
  date: string;
  min?: string;
  max: string;
  recent: Recent[];
  variant?: "admin" | "department";
  /** department panel: short text such as "Closing required · Weekly closing" */
  closingNote?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(date);
  useEffect(() => setValue(date), [date]);

  function go(department: string, d?: string) {
    const q = new URLSearchParams();
    if (showDepartments) q.set("department", department);
    if (d) q.set("date", d);
    start(() => router.push(`/inventory?${q.toString()}`));
  }

  const legend = (
    <>
      <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot("submitted"))} /> Submitted</span>
      <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot("pending"))} /> Draft (open)</span>
      <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot(null))} /> Not started</span>
    </>
  );

  /* ---------- department panel: one slim bar (frozen under the header) ---------- */
  if (variant === "department") {
    return (
      <div className={cn("sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:static", pending && "opacity-70")}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
          <label className="relative block w-full sm:w-44">
            <span className="sr-only">Entry date</span>
            <Icon name="calendar" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={value}
              min={min}
              max={max}
              onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value) go(selectedDepartment, e.target.value);
              }}
              className={cn(inputCls, "!h-10 pl-9")}
            />
          </label>

          <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 sm:flex-none">
            {recent.map((r) => (
              <button
                key={r.date}
                onClick={() => go(selectedDepartment, r.date)}
                aria-pressed={r.date === date}
                disabled={r.disabled}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-40",
                  r.date === date
                    ? "border-slate-900 bg-slate-900 text-white"
                    : r.scheduled === false
                    ? "border-dashed border-slate-300 bg-white text-slate-400 hover:bg-slate-50"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", dot(r.status))} />
                {r.label}
                {r.scheduled === false && <span className="text-[11px] font-normal">no closing</span>}
              </button>
            ))}
          </div>

          {pending && <Spinner className="text-orange-500" />}
          {closingNote && <Badge tone="blue" className="hidden md:inline-flex">{closingNote}</Badge>}
          <div className="ml-auto hidden items-center gap-3 text-xs text-slate-500 lg:flex">{legend}</div>
        </div>
      </div>
    );
  }

  /* ---------- admin / super admin (unchanged) ---------- */
  return (
    <Card className={cn("p-4", pending && "opacity-70")}>
      <div className="flex flex-wrap items-end gap-3">
        {showDepartments && (
          <label className="block w-full sm:w-56">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Department</span>
            <select value={selectedDepartment} onChange={(e) => go(e.target.value, date)} className={selectCls}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block w-full sm:w-52">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Entry date</span>
          <div className="relative">
            <Icon name="calendar" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={value}
              min={min}
              max={max}
              onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value) go(selectedDepartment, e.target.value);
              }}
              className={cn(inputCls, "pl-9")}
            />
          </div>
        </label>

        {pending && <Spinner className="mb-3 text-orange-500" />}
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {recent.map((r) => (
              <button
                key={r.date}
                onClick={() => go(selectedDepartment, r.date)}
                aria-pressed={r.date === date}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
                  r.date === date
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", dot(r.status))} />
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">{legend}</div>
        </div>
      )}
    </Card>
  );
}
