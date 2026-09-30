"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { selectCls } from "@/components/ui";
import { Spinner } from "@/components/ui";

interface Week {
  id: string;
  label: string;
  status: string;
  current: boolean;
}

export default function InventoryFilters({
  departments,
  selectedDepartment,
  showDepartments,
  weeks,
  selectedWeek,
}: {
  departments: { id: string; name: string }[];
  selectedDepartment: string;
  showDepartments: boolean;
  weeks: Week[];
  selectedWeek: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(department: string, period?: string) {
    const q = new URLSearchParams();
    if (showDepartments) q.set("department", department);
    if (period) q.set("period", period);
    start(() => router.push(`/inventory?${q.toString()}`));
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", pending && "opacity-70")}>
      {showDepartments && (
        <select
          aria-label="Department"
          value={selectedDepartment}
          onChange={(e) => go(e.target.value)}
          className={cn(selectCls, "w-full sm:w-56")}
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Week"
        value={selectedWeek}
        onChange={(e) => go(selectedDepartment, e.target.value)}
        className={cn(selectCls, "w-full sm:w-80")}
      >
        {selectedWeek === "" && <option value="">Locked week</option>}
        {weeks.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label}
            {w.current ? " · Current" : ""} · {w.status}
          </option>
        ))}
      </select>
      {pending && <Spinner className="text-orange-500" />}
    </div>
  );
}
