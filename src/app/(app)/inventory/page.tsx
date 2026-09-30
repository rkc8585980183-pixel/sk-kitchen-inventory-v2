import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdmin } from "@/lib/auth";
import { getEntryPolicy, isPeriodOpen } from "@/lib/lock";
import { addDays, chipLabel, fmtDay, fmtWeekday, todayIST } from "@/lib/utils";
import type { Item, PeriodLite } from "@/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import InventoryFilters from "./InventoryFilters";
import InventoryForm from "./InventoryForm";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; date?: string }>;
}) {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const params = await searchParams;
  const admin = isAdmin(profile.role);
  const today = todayIST();

  let date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  if (date > today) date = today;

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

  const open = isPeriodOpen(policy, date);

  // Quick-pick strip: the last (up to) 7 days that are allowed for this user.
  const recentCount = policy.limitDays === null ? 7 : Math.min(policy.limitDays, 7);
  const recentDates = Array.from({ length: recentCount }, (_, i) => addDays(today, -i));

  const [startRes, statusRes, mapRes] = await Promise.all([
    open ? supabase.rpc("start_inventory_day", { p_department_id: departmentId, p_date: date }) : Promise.resolve(null),
    recentDates.length
      ? supabase
          .from("inventory_periods")
          .select("week_start, week_end, status")
          .eq("department_id", departmentId)
          .in("week_start", recentDates)
      : Promise.resolve({ data: [] as { week_start: string; week_end: string; status: string }[] }),
    supabase
      .from("item_mappings")
      .select("items(id, item_code, item_name, category, unit, is_active)")
      .eq("department_id", departmentId),
  ]);

  let locked = !open;
  let period: PeriodLite | null = null;
  let loadError: string | null = null;

  if (open && startRes) {
    const row = Array.isArray(startRes.data) ? startRes.data[0] : startRes.data;
    if (startRes.error) {
      const msg = startRes.error.message;
      if (msg.includes("ENTRY_LOCKED")) locked = true;
      else if (startRes.error.code === "PGRST202" || msg.includes("start_inventory_day"))
        loadError = "Database update pending. Ask the Super Admin to run supabase/migrations/001_entry_lock.sql in Supabase.";
      else loadError = msg;
    } else if (row) {
      period = {
        id: row.id,
        inv_code: row.inv_code,
        week_start: row.week_start,
        week_end: row.week_end,
        status: row.status,
      };
    }
  }

  if (loadError || (!locked && !period)) {
    return (
      <Card>
        <EmptyState icon="alert" title="Could not load inventory">
          {loadError ?? "No entry found for this date."}
        </EmptyState>
      </Card>
    );
  }

  const statusMap = new Map<string, string>(
    (statusRes.data ?? []).filter((p) => p.week_end === p.week_start).map((p) => [p.week_start, p.status])
  );
  if (period) statusMap.set(date, period.status);

  const items: Item[] = ((mapRes.data ?? []) as unknown as { items: Item | null }[])
    .map((m) => m.items)
    .filter((i): i is Item => !!i && i.is_active)
    .sort((a, b) => a.item_code.localeCompare(b.item_code, undefined, { numeric: true }));

  let entries: { item_id: string; quantity: number | null }[] = [];
  if (period) {
    const { data } = await supabase.from("inventory_entries").select("item_id, quantity").eq("period_id", period.id);
    entries = data ?? [];
  }

  const deptName = departments.find((d) => d.id === departmentId)?.name;
  const minDate = policy.cutoff && policy.cutoff <= today ? policy.cutoff : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory entry"
        subtitle={`${deptName ? `${deptName} · ` : ""}${fmtWeekday(date)}`}
        actions={
          policy.limitDays === null ? (
            <Badge tone="green">No date limit</Badge>
          ) : policy.limitDays === 0 ? (
            <Badge tone="red">Entry locked</Badge>
          ) : (
            <Badge tone="orange">
              Entry lock: last {policy.limitDays} day{policy.limitDays === 1 ? "" : "s"} · from {fmtDay(policy.cutoff!, true)}
            </Badge>
          )
        }
      />

      <InventoryFilters
        departments={departments}
        selectedDepartment={departmentId}
        showDepartments={admin}
        date={date}
        min={minDate}
        max={today}
        recent={recentDates.map((d) => ({ date: d, label: chipLabel(d, today), status: statusMap.get(d) ?? null }))}
      />

      {locked || !period ? (
        <Card>
          <EmptyState icon="lock" title="This date is locked">
            {policy.limitDays === 0
              ? "Entry is currently locked for your account. Contact the Super Admin."
              : `You can open only the last ${policy.limitDays ?? ""} day(s). Older dates can be opened only by the Super Admin.`}
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
