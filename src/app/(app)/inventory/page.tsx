import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, requirePerm } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getEntryPolicy, getEntryTime, isPeriodOpen } from "@/lib/lock";
import { getClosingSchedule } from "@/lib/closing";
import { DEFAULT_SCHEDULE, describeSchedule, isClosingDate, isScheduleOn, latestClosingOnOrBefore, nextClosingAfter } from "@/lib/closingSchedule";
import { addDays, chipLabel, fmtDay, fmtTime12, fmtWeekday, nowHHMM, todayIST } from "@/lib/utils";
import type { Item, PeriodLite } from "@/types";
import { Badge, buttonCls, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import DeptHeader, { type Pill } from "@/components/DeptHeader";
import InventoryFilters from "./InventoryFilters";
import InventoryForm from "./InventoryForm";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; date?: string; item?: string }>;
}) {
  const profile = await requirePerm("inventory");
  const supabase = await createClient();
  const params = await searchParams;
  const admin = isAdmin(profile.role);
  const isDept = profile.role === "department_user";
  const today = todayIST();

  const [policy, time, deptRes, schedule, deptNameRes] = await Promise.all([
    getEntryPolicy(),
    getEntryTime(),
    admin
      ? supabase.from("departments").select("id, name").eq("is_active", true).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    // The closing schedule is set by the Admin (Settings). The department panel only reads it.
    isDept ? getClosingSchedule() : Promise.resolve(DEFAULT_SCHEDULE),
    isDept && profile.department_id
      ? supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);
  const departments = deptRes.data ?? [];
  const scheduleOn = isDept && isScheduleOn(schedule);
  const minDate = policy.cutoff && policy.cutoff <= today ? policy.cutoff : undefined;

  // ---- which date is shown ----
  let date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : "";
  if (date > today) date = today;
  if (!date) {
    date = today;
    if (scheduleOn && !isClosingDate(schedule, today)) {
      // department panel: jump to the latest required closing (if the user may still open it)
      const latest = latestClosingOnOrBefore(schedule, today);
      if (latest && (!policy.cutoff || latest >= policy.cutoff)) date = latest;
    }
  }

  // ---- department panel: header + frame ----
  const deptName = deptNameRes.data?.name ?? "Department";
  const nextClosing = scheduleOn ? (isClosingDate(schedule, today) ? today : nextClosingAfter(schedule, today)) : null;
  const pills: Pill[] = [];
  if (isDept) {
    pills.push(
      policy.limitDays === null
        ? { icon: "unlock", text: "No date limit" }
        : policy.limitDays === 0
        ? { icon: "lock", text: "Entry locked", tone: "bad" }
        : { icon: "lock", text: `Entry lock: last ${policy.limitDays} day${policy.limitDays === 1 ? "" : "s"} · from ${fmtDay(policy.cutoff!, true)}` }
    );
    if (time.applies && time.open && time.close) {
      pills.push({
        icon: "clock",
        text: `Entry time ${fmtTime12(time.open)} – ${fmtTime12(time.close)} · ${time.isOpen ? "Open now" : "Closed now"}`,
        tone: time.isOpen ? "ok" : "warn",
      });
    }
    if (scheduleOn) {
      pills.push({ icon: "calendar", text: describeSchedule(schedule) });
      if (nextClosing) {
        pills.push({
          icon: "calendar",
          text: nextClosing === today ? `Closing today · opens ${fmtTime12(schedule.time)}` : `Next closing: ${fmtWeekday(nextClosing)}`,
        });
      }
    }
  }
  // Header + date bar are frozen on tablet / desktop (on phones only the date bar stays, to keep space).
  const frame = (content: React.ReactNode, bar?: React.ReactNode) => (
    <>
      <div className="contents md:sticky md:top-0 md:z-40 md:block md:shadow-md">
        <DeptHeader deptName={deptName} userName={profile.full_name} pills={pills} />
        {bar}
      </div>
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-3 sm:px-6">{content}</div>
    </>
  );

  const departmentId = admin ? params.department || departments[0]?.id || null : profile.department_id;
  if (!departmentId) {
    const card = (
      <Card>
        <EmptyState icon="departments" title="No department assigned">
          Ask your administrator to assign you to a department.
        </EmptyState>
      </Card>
    );
    return isDept ? frame(card) : card;
  }

  // Daily entry time (set in Settings): outside the window the entry is closed for departments.
  if (time.applies && !time.isOpen && time.open && time.close) {
    const closed = (
      <Card>
        <EmptyState icon="clock" title="Entry is closed right now">
          Entry is open every day from <b>{fmtTime12(time.open)}</b> to <b>{fmtTime12(time.close)}</b> (India time). Please come back during that time.
        </EmptyState>
      </Card>
    );
    if (isDept) return frame(closed);
    return (
      <div className="space-y-5">
        <PageHeader title="Inventory entry" subtitle={fmtWeekday(today)} />
        {closed}
      </div>
    );
  }

  // ---- closing schedule (department panel) ----
  const periodOpen = isPeriodOpen(policy, date);
  const notScheduled = scheduleOn && !isClosingDate(schedule, date);
  const notOpenYet = scheduleOn && !notScheduled && date === today && nowHHMM() < schedule.time;
  const open = periodOpen && !notScheduled && !notOpenYet;

  // Quick-pick strip
  let chipDates: string[];
  if (isDept) {
    chipDates = [today, addDays(today, -1)];
    const maxBack = policy.limitDays === null ? 62 : Math.max(policy.limitDays - 1, 0);
    for (let i = 2; i <= maxBack && chipDates.length < 7; i++) {
      const d = addDays(today, -i);
      if (!scheduleOn || isClosingDate(schedule, d)) chipDates.push(d);
    }
  } else {
    const recentCount = policy.limitDays === null ? 7 : Math.min(policy.limitDays, 7);
    chipDates = Array.from({ length: recentCount }, (_, i) => addDays(today, -i));
  }

  const [startRes, statusRes, mapRes] = await Promise.all([
    open ? supabase.rpc("start_inventory_day", { p_department_id: departmentId, p_date: date }) : Promise.resolve(null),
    chipDates.length
      ? supabase
          .from("inventory_periods")
          .select("week_start, week_end, status")
          .eq("department_id", departmentId)
          .in("week_start", chipDates)
      : Promise.resolve({ data: [] as { week_start: string; week_end: string; status: string }[] }),
    supabase
      .from("item_mappings")
      .select("sort_order, items(id, item_code, item_name, category, unit, is_active)")
      .eq("department_id", departmentId),
  ]);

  let locked = !periodOpen;
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

  if (loadError || (open && !locked && !period)) {
    const card = (
      <Card>
        <EmptyState icon="alert" title="Could not load inventory">
          {loadError ?? "No entry found for this date."}
        </EmptyState>
      </Card>
    );
    return isDept ? frame(card) : card;
  }

  const statusMap = new Map<string, string>(
    (statusRes.data ?? []).filter((p) => p.week_end === p.week_start).map((p) => [p.week_start, p.status])
  );
  if (period) statusMap.set(date, period.status);

  // Same order as the Excel that was uploaded (item_mappings.sort_order); items without an order follow by code.
  type MapRow = { sort_order?: number | null; items: Item | null };
  let mapRows = (mapRes.data ?? []) as unknown as MapRow[];
  if (mapRes.error) {
    // sort_order column not created yet (SQL not run): fall back to the plain list
    const retry = await supabase
      .from("item_mappings")
      .select("items(id, item_code, item_name, category, unit, is_active)")
      .eq("department_id", departmentId);
    mapRows = (retry.data ?? []) as unknown as MapRow[];
  }
  const items: Item[] = mapRows
    .filter((m): m is { sort_order?: number | null; items: Item } => !!m.items && m.items.is_active)
    .sort(
      (a, b) =>
        (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) ||
        a.items.item_code.localeCompare(b.items.item_code, undefined, { numeric: true })
    )
    .map((m) => m.items);

  let entries: { item_id: string; quantity: number | null }[] = [];
  if (period) {
    const { data } = await supabase.from("inventory_entries").select("item_id, quantity").eq("period_id", period.id);
    entries = data ?? [];
  }

  // ================= department panel =================
  if (isDept) {
    const latest = scheduleOn ? latestClosingOnOrBefore(schedule, today) : null;
    const stateCard = locked ? (
      <Card>
        <EmptyState icon="lock" title="This date is locked">
          {policy.limitDays === 0
            ? "Entry is currently locked for your account. Contact the Super Admin."
            : `You can open only the last ${policy.limitDays ?? ""} day(s). Older dates can be opened only by the Super Admin.`}
        </EmptyState>
      </Card>
    ) : notScheduled ? (
      <Card>
        <EmptyState icon="calendar" title="No closing is required on this date">
          Closing follows the schedule set by your Admin: {describeSchedule(schedule)}.
          {nextClosing && <> Next closing: <b>{fmtWeekday(nextClosing)}</b>.</>}
          {latest && latest !== date && (!policy.cutoff || latest >= policy.cutoff) && (
            <div className="mt-4">
              <Link href={`/inventory?date=${latest}`} className={buttonCls("primary")}>
                Go to the latest closing ({fmtWeekday(latest)})
              </Link>
            </div>
          )}
        </EmptyState>
      </Card>
    ) : notOpenYet ? (
      <Card>
        <EmptyState icon="clock" title={`Closing opens at ${fmtTime12(schedule.time)}`}>
          Today is a closing day. The closing entry opens at <b>{fmtTime12(schedule.time)}</b> (India time). Please come back then.
        </EmptyState>
      </Card>
    ) : null;

    return frame(
      stateCard ??
        (period && (
          <InventoryForm
            key={period.id}
            variant="department"
            period={period}
            items={items}
            initialEntries={entries}
            canEdit={period.status !== "submitted"}
            canUnlock={false}
            focusItemId={params.item}
          />
        )),
      <InventoryFilters
        variant="department"
        departments={[]}
        selectedDepartment={departmentId}
        showDepartments={false}
        date={date}
        min={minDate}
        max={today}
        closingNote={scheduleOn && !notScheduled ? `Closing required · ${describeSchedule(schedule)}` : undefined}
        recent={chipDates.map((d) => ({
          date: d,
          label: chipLabel(d, today),
          status: statusMap.get(d) ?? null,
          scheduled: scheduleOn ? isClosingDate(schedule, d) : true,
          disabled: !!policy.cutoff && d < policy.cutoff,
        }))}
      />
    );
  }

  // ================= admin / super admin (unchanged) =================
  const adminDeptName = departments.find((d) => d.id === departmentId)?.name;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory entry"
        subtitle={`${adminDeptName ? `${adminDeptName} · ` : ""}${fmtWeekday(date)}`}
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

      {time.applies && time.open && time.close && (
        <Notice tone="info" icon="clock">
          Entry time today: <b>{fmtTime12(time.open)}</b> to <b>{fmtTime12(time.close)}</b> (India time).
        </Notice>
      )}

      <InventoryFilters
        departments={departments}
        selectedDepartment={departmentId}
        showDepartments={admin}
        date={date}
        min={minDate}
        max={today}
        recent={chipDates.map((d) => ({ date: d, label: chipLabel(d, today), status: statusMap.get(d) ?? null }))}
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
          canUnlock={can(profile, "entries_unlock")}
          focusItemId={params.item}
        />
      )}
    </div>
  );
}
