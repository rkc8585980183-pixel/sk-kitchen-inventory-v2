import { createClient } from "@/lib/supabase/server";

export default async function TrailPage() {
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Trail / Audit Log</h1>
        <p className="text-sm text-gray-500">Last 200 activities</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Record ID</th>
            </tr>
          </thead>
          <tbody>
            {(logs || []).map((l) => {
              const dt = new Date(l.created_at);
              return (
                <tr key={l.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{dt.toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{dt.toLocaleTimeString()}</td>
                  <td className="px-4 py-2 text-gray-900">{l.username}</td>
                  <td className="px-4 py-2 text-gray-500 capitalize">{l.role?.replace("_", " ") || "-"}</td>
                  <td className="px-4 py-2 text-gray-500">{l.department_name || "-"}</td>
                  <td className="px-4 py-2 text-gray-700">{l.action.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-gray-500">{l.description || "-"}</td>
                  <td className="px-4 py-2 text-gray-400">{l.record_id || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
