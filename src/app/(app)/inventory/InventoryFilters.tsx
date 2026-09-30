"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import Icon from "@/components/Icons";
import { Card, inputCls, selectCls, Spinner } from "@/components/ui";

interface Recent {
  date: string;
  label: string;
  status: string | null;
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
}: {
  departments: { id: string; name: string }[];
  selectedDepartment: string;
  showDepartments: boolean;
  date: string;
  min?: string;
  max: string;
  recent: Recent[];
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
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot("submitted"))} /> Submitted</span>
            <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot("pending"))} /> Draft (open)</span>
            <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot(null))} /> Not started</span>
          </div>
        </div>
      )}
    </Card>
  );
}
