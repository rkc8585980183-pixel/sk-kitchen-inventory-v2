"use client";

import { ALL_PERMS, PERMISSIONS, type PermKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

export default function PermissionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const on = new Set(value);

  function toggle(k: PermKey) {
    const next = new Set(on);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(ALL_PERMS.filter((p) => next.has(p)));
  }

  const group = (g: "tabs" | "actions", title: string) => (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {PERMISSIONS.filter((p) => p.group === g).map((p) => (
          <label
            key={p.key}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition",
              on.has(p.key) ? "border-orange-300 bg-orange-50/60" : "border-slate-200 hover:bg-slate-50"
            )}
          >
            <input
              type="checkbox"
              checked={on.has(p.key)}
              onChange={() => toggle(p.key)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900">{p.label}</span>
              <span className="block text-xs text-slate-500">{p.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onChange([...ALL_PERMS])}>Select all</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([])}>Clear all</Button>
      </div>
      {group("tabs", "Tabs this admin can open")}
      {group("actions", "What this admin can do")}
    </div>
  );
}
