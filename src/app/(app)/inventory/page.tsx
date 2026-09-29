import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdmin } from "@/lib/auth";
import InventoryForm from "./InventoryForm";
import DepartmentPicker from "./DepartmentPicker";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const params = await searchParams;

  let departmentId = profile.department_id;
  let departments: { id: string; name: string }[] = [];

  if (isAdmin(profile.role)) {
    const { data } = await supabase
      .from("departments")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    departments = data || [];
    departmentId = params.department || departments[0]?.id || null;
  }

  if (!departmentId) {
    return <p className="text-sm text-gray-500">No department assigned.</p>;
  }

  // Ensure/get this week's period
  const { data: period, error: startErr } = await supabase.rpc("start_inventory", {
    p_department_id: departmentId,
  });

  if (startErr || !period) {
    return (
      <p className="text-sm text-red-600">
        Could not load inventory period: {startErr?.message}
      </p>
    );
  }

  const periodRow = Array.isArray(period) ? period[0] : period;

  const { data: mappedItems } = await supabase
    .from("item_mappings")
    .select("items(id, item_code, item_name, category, unit, is_active)")
    .eq("department_id", departmentId);

  const items = (mappedItems || [])
    .map((m: any) => m.items)
    .filter((i: any) => i && i.is_active);

  const { data: entries } = await supabase
    .from("inventory_entries")
    .select("item_id, quantity")
    .eq("period_id", periodRow.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventory Entry</h1>
          <p className="text-sm text-gray-500">
            Week {periodRow.week_start} – {periodRow.week_end}
          </p>
        </div>
        {isAdmin(profile.role) && (
          <DepartmentPicker departments={departments} selected={departmentId} />
        )}
      </div>
      <InventoryForm
        period={periodRow}
        items={items}
        initialEntries={entries || []}
        canEdit={periodRow.status !== "submitted"}
        canUnlock={isAdmin(profile.role)}
      />
    </div>
  );
}
