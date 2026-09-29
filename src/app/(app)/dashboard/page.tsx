import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isAdmin } from "@/lib/auth";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    submitted: "bg-green-100 text-green-700",
    pending: "bg-gray-100 text-gray-600",
    unlocked: "bg-yellow-100 text-yellow-700",
    late: "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, is_active")
    .eq("is_active", true);

  const { data: periods } = await supabase
    .from("inventory_periods")
    .select("id, department_id, status, submitted_at, inv_code")
    .order("submitted_at", { ascending: false });

  const { data: items } = await supabase.from("items").select("id").eq("is_active", true);

  const today = new Date().toISOString().slice(0, 10);
  const todaysSubmissions =
    periods?.filter((p) => p.submitted_at && p.submitted_at.slice(0, 10) === today).length || 0;

  const deptRows = (departments || []).map((d) => {
    const latest = periods?.find((p) => p.department_id === d.id);
    return { dept: d, period: latest };
  });

  const submittedCount = deptRows.filter((r) => r.period?.status === "submitted").length;
  const pendingCount = deptRows.filter((r) => !r.period || r.period.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Welcome back, {profile.full_name}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Departments", value: departments?.length || 0 },
          { label: "Submitted", value: submittedCount },
          { label: "Pending", value: pendingCount },
          { label: "Total Items", value: items?.length || 0 },
          ...(isAdmin(profile.role)
            ? [{ label: "Today's Submissions", value: todaysSubmissions }]
            : []),
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900 text-sm">Department Status</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-5 py-2 font-medium">Department</th>
              <th className="px-5 py-2 font-medium">Status</th>
              <th className="px-5 py-2 font-medium">Submitted At</th>
              <th className="px-5 py-2 font-medium">Inv Code</th>
            </tr>
          </thead>
          <tbody>
            {deptRows.map(({ dept, period }) => (
              <tr key={dept.id} className="border-b border-gray-50 last:border-0">
                <td className="px-5 py-3 text-gray-900">{dept.name}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={period?.status || "pending"} />
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {period?.submitted_at
                    ? new Date(period.submitted_at).toLocaleString()
                    : "-"}
                </td>
                <td className="px-5 py-3 text-gray-500">{period?.inv_code || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
