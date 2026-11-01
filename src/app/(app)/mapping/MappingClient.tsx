"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, EmptyState, inputCls, Notice, PageHeader } from "@/components/ui";

type PeriodType = "weekly" | "monthly" | "both";

interface Item { id: string; item_code: string; item_name: string }
interface Dept { id: string; name: string; code: string }

/** mapping for one item: dept_id → period_type (undefined = not mapped) */
type MappingState = Map<string, PeriodType>;

export default function MappingClient({
  items,
  departments,
  initialMappings,
}: {
  items: Item[];
  departments: Dept[];
  initialMappings: { item_id: string; department_id: string; period_type: string }[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [selectedItem, setSelectedItem] = useState<string>(items[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [saving, setSaving] = useState(false);

  // ── Build per-item mapping map from DB data ──────────────────────
  const byItem = useMemo(() => {
    const m = new Map<string, MappingState>();
    for (const x of initialMappings) {
      if (!m.has(x.item_id)) m.set(x.item_id, new Map());
      m.get(x.item_id)!.set(x.department_id, (x.period_type ?? "both") as PeriodType);
    }
    return m;
  }, [initialMappings]);

  // local state for the currently selected item's mapping
  const [local, setLocal] = useState<MappingState>(
    () => new Map(byItem.get(items[0]?.id ?? "") ?? [])
  );

  function selectItem(id: string) {
    setSelectedItem(id);
    setLocal(new Map(byItem.get(id) ?? []));
  }

  /** cycle through: unmapped → weekly → monthly → both → unmapped */
  function cycle(deptId: string) {
    setLocal((prev) => {
      const next = new Map(prev);
      const cur = next.get(deptId);
      if (cur === undefined)    next.set(deptId, "weekly");
      else if (cur === "weekly")  next.set(deptId, "monthly");
      else if (cur === "monthly") next.set(deptId, "both");
      else                        next.delete(deptId);       // 'both' → remove mapping
      return next;
    });
  }

  function setPeriodType(deptId: string, type: PeriodType | null) {
    setLocal((prev) => {
      const next = new Map(prev);
      if (type === null) next.delete(deptId);
      else next.set(deptId, type);
      return next;
    });
  }

  /** Select all depts with given period_type */
  function setAllTo(type: PeriodType) {
    setLocal(new Map(departments.map((d) => [d.id, type])));
  }

  function clearAll() {
    setLocal(new Map());
  }

  // ── Detect changes ───────────────────────────────────────────────
  const original = byItem.get(selectedItem) ?? new Map<string, PeriodType>();
  const changed = useMemo(() => {
    if (local.size !== original.size) return true;
    for (const [k, v] of local) { if (original.get(k) !== v) return true; }
    for (const k of original.keys()) { if (!local.has(k)) return true; }
    return false;
  }, [local, original]);

  // ── Save ─────────────────────────────────────────────────────────
  async function save() {
    setSaving(true);

    const toUpsert: { item_id: string; department_id: string; period_type: string }[] = [];
    const toDelete: string[] = []; // dept_ids

    // Determine what to add/update vs delete
    for (const [deptId, pt] of local) {
      toUpsert.push({ item_id: selectedItem, department_id: deptId, period_type: pt });
    }
    for (const deptId of original.keys()) {
      if (!local.has(deptId)) toDelete.push(deptId);
    }

    const ops = [];

    if (toUpsert.length) {
      // upsert on (item_id, department_id)
      ops.push(
        supabase.from("item_mappings").upsert(toUpsert, {
          onConflict: "item_id,department_id",
          ignoreDuplicates: false,
        })
      );
    }
    if (toDelete.length) {
      ops.push(
        supabase
          .from("item_mappings")
          .delete()
          .eq("item_id", selectedItem)
          .in("department_id", toDelete)
      );
    }

    const results = await Promise.all(ops);
    setSaving(false);
    const err = results.find((r) => r.error)?.error;
    if (err) return toast(err.message, "error");
    toast("Mapping saved.");
    router.refresh();
  }

  // ── Filtered item list ───────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const s = deferred.trim().toLowerCase();
    return s
      ? items.filter(
          (i) =>
            i.item_name.toLowerCase().includes(s) ||
            i.item_code.toLowerCase().includes(s)
        )
      : items;
  }, [items, deferred]);

  const selected = items.find((i) => i.id === selectedItem);

  // Group departments by outlet (first 2 segments of code e.g. "CC-DL")
  const outletGroups = useMemo(() => {
    const groups = new Map<string, Dept[]>();
    for (const d of departments) {
      const outlet = d.code?.includes("-")
        ? d.code.split("-").slice(0, 2).join("-")
        : d.code ?? "Other";
      if (!groups.has(outlet)) groups.set(outlet, []);
      groups.get(outlet)!.push(d);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [departments]);

  // Badge counts per item
  const itemCounts = useMemo(() => {
    const m = new Map<string, { w: number; mo: number; b: number }>();
    for (const [itemId, mapping] of byItem) {
      let w = 0, mo = 0, b = 0;
      for (const pt of mapping.values()) {
        if (pt === "weekly") w++;
        else if (pt === "monthly") mo++;
        else b++;
      }
      m.set(itemId, { w, mo, b });
    }
    return m;
  }, [byItem]);

  return (
    <div>
      <PageHeader
        title="Item mapping"
        subtitle="Map each item to departments — choose whether it appears in Weekly closing, Monthly closing, or Both."
      />

      <Notice tone="info" icon="info">
        <b>How period type works:</b> &nbsp;
        <span className="inline-flex items-center gap-1"><PTypeBadge type="weekly" /></span> = only in weekly closing &nbsp;·&nbsp;
        <span className="inline-flex items-center gap-1"><PTypeBadge type="monthly" /></span> = only in month-end closing &nbsp;·&nbsp;
        <span className="inline-flex items-center gap-1"><PTypeBadge type="both" /></span> = always shown &nbsp;·&nbsp;
        <b>Unchecked</b> = not mapped (item hidden)
      </Notice>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        {/* ── Item list ─────────────────────────────────────── */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                placeholder="Search item…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(inputCls, "pl-9")}
              />
            </div>
          </div>

          <ul className="max-h-[36rem] divide-y divide-slate-100 overflow-y-auto">
            {filteredItems.map((i) => {
              const c = itemCounts.get(i.id);
              const total = (c?.w ?? 0) + (c?.mo ?? 0) + (c?.b ?? 0);
              const active = selectedItem === i.id;
              return (
                <li key={i.id}>
                  <button
                    onClick={() => selectItem(i.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                      active ? "bg-orange-50" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          active ? "text-orange-700" : "text-slate-900"
                        )}
                      >
                        {i.item_name}
                      </p>
                      <p className="text-xs text-slate-500">{i.item_code}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {total > 0 ? (
                        <span className="flex gap-1">
                          {(c?.w ?? 0) > 0 && <PTypeBadge type="weekly" count={c!.w} />}
                          {(c?.mo ?? 0) > 0 && <PTypeBadge type="monthly" count={c!.mo} />}
                          {(c?.b ?? 0) > 0 && <PTypeBadge type="both" count={c!.b} />}
                        </span>
                      ) : (
                        <Badge tone="slate">Not mapped</Badge>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
            {filteredItems.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-slate-400">
                No items found.
              </li>
            )}
          </ul>
        </Card>

        {/* ── Dept mapping panel ────────────────────────────── */}
        <Card className="lg:col-span-3">
          {selected ? (
            <div className="p-5">
              <h2 className="font-semibold text-slate-900">{selected.item_name}</h2>
              <p className="text-xs text-slate-500">{selected.item_code}</p>

              {/* bulk actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAllTo("both")}>
                  All → Both
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAllTo("weekly")}>
                  All → Weekly
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAllTo("monthly")}>
                  All → Monthly
                </Button>
                <Button size="sm" variant="ghost" onClick={clearAll}>
                  Clear all
                </Button>
              </div>

              {/* outlet-wise dept list */}
              <div className="mt-4 space-y-5">
                {outletGroups.map(([outlet, depts]) => (
                  <div key={outlet}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {outlet}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {depts.map((d) => {
                        const pt = local.get(d.id) ?? null;
                        return (
                          <DeptMappingRow
                            key={d.id}
                            dept={d}
                            periodType={pt}
                            onChange={(v) => setPeriodType(d.id, v)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                {changed && (
                  <span className="text-xs text-amber-600">Unsaved changes</span>
                )}
                <Button
                  variant="primary"
                  loading={saving}
                  disabled={!changed}
                  onClick={save}
                >
                  Save mapping
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState icon="mapping" title="Select an item">
              Pick an item on the left to manage its department mapping.
            </EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── Department mapping row ─────────────────────────────────────────── */
function DeptMappingRow({
  dept,
  periodType,
  onChange,
}: {
  dept: Dept;
  periodType: PeriodType | null;
  onChange: (v: PeriodType | null) => void;
}) {
  const mapped = periodType !== null;

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 transition",
        mapped
          ? "border-orange-200 bg-orange-50/40"
          : "border-slate-200 bg-white"
      )}
    >
      {/* top row: checkbox + dept name */}
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={mapped}
          onChange={() => onChange(mapped ? null : "both")}
          className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
        />
        <span
          className={cn(
            "flex-1 text-sm font-medium",
            mapped ? "text-slate-900" : "text-slate-500"
          )}
        >
          {dept.name}
        </span>
        {mapped && <PTypeBadge type={periodType!} />}
      </label>

      {/* period toggle — only shown when mapped */}
      {mapped && (
        <div className="mt-2 flex gap-1 pl-6">
          {(["weekly", "monthly", "both"] as PeriodType[]).map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                periodType === opt
                  ? ptActive[opt]
                  : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
              )}
            >
              {ptLabel[opt]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Period type badge ──────────────────────────────────────────────── */
const ptLabel: Record<PeriodType, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  both: "Both",
};

const ptActive: Record<PeriodType, string> = {
  weekly: "bg-sky-500 text-white",
  monthly: "bg-violet-500 text-white",
  both: "bg-emerald-500 text-white",
};

const ptBadge: Record<PeriodType, string> = {
  weekly: "bg-sky-50 text-sky-700 ring-sky-600/15",
  monthly: "bg-violet-50 text-violet-700 ring-violet-600/15",
  both: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
};

function PTypeBadge({ type, count }: { type: PeriodType; count?: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        ptBadge[type]
      )}
    >
      {ptLabel[type]}
      {count !== undefined && <span className="ml-1 opacity-70">×{count}</span>}
    </span>
  );
}
