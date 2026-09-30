import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdmin } from "@/lib/auth";
import { getEntryPolicy, isPeriodOpen } from "@/lib/lock";
import { fmtDay, fmtRange } from "@/lib/utils";
import type { Item, PeriodLite } from "@/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import InventoryFilters from "./InventoryFilters";
import InventoryForm from "./InventoryForm";

export const metadata = { title: "Inventory" };

const PERIOD_COLS = "id, inv_code, week_start, week_end, status";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; period?: string }>;
}) {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const params = await searchParams;
  const admin = isAdmin(profile.role);

  const [policy, deptRes] = await Promise.all([
    getEntryPolicy(),
    admin
      ? supabase.from("departments").select("id, name").eq("is_active", true).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const departments = deptRes.data ?? [];

  const departmentId = admin ? params.department || departments[0]?.id || null : profile.department_id;
  if (!departmentId) {
    return (
      <Card>
        <EmptyState icon="departments" title="No department assigned">
          Ask your administrator to assign you to a department.
        </EmptyState>
      </Card>
    );
  }

  let histQuery = supabase
    .from("inventory_periods")
    .select(PERIOD_COLS)
    .eq("department_id", departmentId)
    .order("week_start", { ascending: false })
    .limit(60);
  if (policy.cutoff) histQuery = histQuery.gte("week_end", policy.cutoff);

  // Current week period + week history + mapped items: all in parallel.
  const [startRes, histRes, mapRes] = await Promise.all([
    supabase.rpc("start_inventory", { p_department_id: departmentId }),
    histQuery,
    supabase
      .from("item_mappings")
      .select("items(id, item_code, item_name, category, unit, is_active)")
      .eq("department_id", departmentId),
  ]);

  const currentRow = Array.isArray(startRes.data) ? startRes.data[0] : startRes.data;
  if (startRes.error || !currentRow) {
    return (
      <Card>
        <EmptyState icon="alert" title="Could not load inventory">
          {startRes.error?.message ?? "No period found."}
        </EmptyState>
      </Card>
    );
  }
  const current: PeriodLite = {
    id: currentRow.id,
    inv_code: currentRow.inv_code,
    week_start: currentRow.week_start,
    week_end: currentRow.week_end,
    status: currentRow.status,
  };

  const history: PeriodLite[] = (histRes.data as PeriodLite[] | null) ?? [];
  if (!history.some((h) => h.id === current.id)) history.unshift(current);

  // Which week is being viewed?
  let period: PeriodLite = current;
  let locked = false;
  let lockedRange: string | null = null;

  if (params.period && params.period !== current.id) {
    const inList = history.find((h) => h.id === params.period);
    if (inList) {
      period = inList;
    } else {
      const { data: other } = await supabase
        .from("inventory_periods")
        .select(PERIOD_COLS)
        .eq("id", params.period)
        .eq("department_id", departmentId)
        .maybeSingle();
      if (other) {
        if (isPeriodOpen(policy, other.week_end)) {
          period = other as PeriodLite;
          history.push(period);
        } else {
          locked = true;
          lockedRange = fmtRange(other.week_start, other.week_end);
        }
      }
    }
  }

  const items: Item[] = ((mapRes.data ?? []) as unknown as { items: Item | null }[])
    .map((m) => m.items)
    .filter((i): i is Item => !!i && i.is_active)
    .sort((a, b) => a.item_code.localeCompare(b.item_code, undefined, { numeric: true }));

  let entries: { item_id: string; quantity: number | null }[] = [];
  if (!locked) {
    const { data } = await supabase.from("inventory_entries").select("item_id, quantity").eq("period_id", period.id);
    entries = data ?? [];
  }

  const deptName = departments.find((d) => d.id === departmentId)?.name;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory entry"
        subtitle={
          locked ? (
            <>Week {lockedRange}</>
          ) : (
            <>
              {deptName ? `${deptName} · ` : ""}Week {fmtRange(period.week_start, period.week_end)}
              {period.id === current.id && " (current)"}
            </>
          )
        }
        actions={
          policy.limitDays === null ? (
            <Badge tone="green">No date limit</Badge>
          ) : (
            <Badge tone="slate">
              Open from {fmtDay(policy.cutoff!, true)} · {policy.limitDays} day{policy.limitDays === 1 ? "" : "s"} back
            </Badge>
          )
        }
      />

      <InventoryFilters
        departments={departments}
        selectedDepartment={departmentId}
        showDepartments={admin}
        weeks={history.map((h) => ({
          id: h.id,
          label: fmtRange(h.week_start, h.week_end),
          status: h.status,
          current: h.id === current.id,
        }))}
        selectedWeek={locked ? "" : period.id}
      />

      {locked ? (
        <Card>
          <EmptyState icon="lock" title="This entry is locked">
            Entries older than your allowed limit{policy.limitDays !== null ? ` (${policy.limitDays} days)` : ""} can be opened only by the Super Admin.
          </EmptyState>
        </Card>
      ) : (
        <InventoryForm
          key={period.id}
          period={period}
          items={items}
          initialEntries={entries}
          canEdit={period.status !== "submitted"}
          canUnlock={admin}
        />
      )}
    </div>
  );
}
