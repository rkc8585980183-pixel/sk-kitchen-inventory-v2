"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import Icon from "@/components/Icons";
import { inputCls, selectCls, Spinner } from "@/components/ui";

interface Recent {
  date: string;
  label: string;
  status: string | null;
  scheduled?: boolean;
  disabled?: boolean;
}

const dot = (status: string | null) =>
  status === "submitted" ? "bg-emerald-500"
  : status === "unlocked" ? "bg-amber-500"
  : status === "pending" ? "bg-orange-400"
  : "border border-slate-300 bg-white";

export default function InventoryFilters({
  departments, selectedDepartment, showDepartments, date, min, max, recent,
  variant = "admin", closingNote,
}: {
  departments: { id: string; name: string }[];
  selectedDepartment: string;
  showDepartments: boolean;
  date: string; min?: string; max: string;
  recent: Recent[];
  variant?: "admin" | "department";
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

  /* ---- Department panel: slim dark-maroon date bar (frozen) ---- */
  if (variant === "department") {
    return (
      <div className={cn("sticky top-0 z-30 border-b border-[#3C0618]/20 bg-[#3C0618]/5 backdrop-blur", pending && "opacity-60")}>
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-1.5 sm:px-5">
          {/* date input */}
          <label className="relative block w-full sm:w-40">
            <span className="sr-only">Entry date</span>
            <Icon name="calendar" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#3C0618]/60" />
            <input
              type="date" value={value} min={min} max={max}
              onChange={(e) => { setValue(e.target.value); if (e.target.value) go(selectedDepartment, e.target.value); }}
              className="h-8 w-full rounded border border-[#3C0618]/30 bg-white pl-8 pr-2 text-xs font-medium text-slate-700 focus:border-[#3C0618] focus:outline-none focus:ring-2 focus:ring-[#3C0618]/20"
            />
          </label>

          {/* quick-date chips */}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {recent.map((r) => (
              <button
                key={r.date}
                onClick={() => go(selectedDepartment, r.date)}
                aria-pressed={r.date === date}
                disabled={r.disabled}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition disabled:pointer-events-none disabled:opacity-40",
                  r.date === date
                    ? "border-[#3C0618] bg-[#3C0618] text-white"
                    : r.scheduled === false
                    ? "border-dashed border-slate-300 text-slate-400 hover:bg-slate-50"
                    : "border-slate-300 bg-white text-slate-700 hover:border-[#3C0618]/40 hover:bg-[#3C0618]/5"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", dot(r.status))} />
                {r.label}
                {r.scheduled === false && <span className="text-[10px] font-normal">(no closing)</span>}
              </button>
            ))}
          </div>

          {pending && <Spinner className="text-[#3C0618]" />}

          {/* legend + note */}
          <div className="ml-auto hidden items-center gap-3 text-[10px] text-slate-500 md:flex">
            <span className="flex items-center gap-1"><span className={cn("h-1.5 w-1.5 rounded-full", dot("submitted"))} /> Submitted</span>
            <span className="flex items-center gap-1"><span className={cn("h-1.5 w-1.5 rounded-full", dot("pending"))} /> Draft</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full border border-slate-300 bg-white" /> New</span>
            {closingNote && <span className="ml-1 rounded bg-sky-100 px-2 py-0.5 text-sky-700">{closingNote}</span>}
          </div>
        </div>
      </div>
    );
  }

  /* ---- Admin panel: unchanged card style ---- */
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card", pending && "opacity-70")}>
      <div className="flex flex-wrap items-end gap-3">
        {showDepartments && (
          <label className="block w-full sm:w-56">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Department</span>
            <select value={selectedDepartment} onChange={(e) => go(e.target.value, date)}
              className={selectCls}>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        <label className="block w-full sm:w-52">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Entry date</span>
          <div className="relative">
            <Icon name="calendar" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="date" value={value} min={min} max={max}
              onChange={(e) => { setValue(e.target.value); if (e.target.value) go(selectedDepartment, e.target.value); }}
              className={cn(inputCls, "pl-9")} />
          </div>
        </label>
        {pending && <Spinner className="mb-3 text-orange-500" />}
      </div>
      {recent.length > 0 && (
        <div className="mt-4">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {recent.map((r) => (
              <button key={r.date} onClick={() => go(selectedDepartment, r.date)} aria-pressed={r.date === date}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
                  r.date === date ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                )}>
                <span className={cn("h-2 w-2 rounded-full", dot(r.status))} />
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot("submitted"))} /> Submitted</span>
            <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot("pending"))} /> Draft (open)</span>
            <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot(null))} /> Not started</span>
          </div>
        </div>
      )}
    </div>
  );
}
