import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, roleLabel } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, td, th } from "@/components/ui";

export const metadata = { title: "Audit Trail" };

const tone = (a: string) =>
  /unlock/.test(a) ? "amber" : /submit/.test(a) ? "green" : /delete|deactivat/.test(a) ? "red" : /create|add/.test(a) ? "blue" : "slate";

export default async function TrailPage() {
  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <PageHeader title="Audit trail" subtitle="Last 200 activities · times shown in IST" />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50/70">
              <tr>
                <th className={th}>When</th>
                <th className={th}>User</th>
                <th className={th}>Department</th>
                <th className={th}>Action</th>
                <th className={th}>Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(logs ?? []).map((l) => (
                <tr key={l.id} className="align-top hover:bg-slate-50/60">
                  <td className={`${td} whitespace-nowrap`}>{fmtDateTime(l.created_at)}</td>
                  <td className={td}>
                    <p className="font-medium text-slate-900">{l.username}</p>
                    <p className="text-xs text-slate-500">{l.role ? roleLabel(l.role) : "—"}</p>
                  </td>
                  <td className={td}>{l.department_name || "—"}</td>
                  <td className={td}>
                    <Badge tone={tone(l.action)} className="capitalize">{String(l.action).replace(/_/g, " ")}</Badge>
                  </td>
                  <td className={td}>{l.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(logs ?? []).length === 0 && <EmptyState icon="trail" title="No activity yet" />}
        </div>
      </Card>
    </div>
  );
}
