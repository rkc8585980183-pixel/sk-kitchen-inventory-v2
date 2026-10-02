import Link from "next/link";
import { getAlerts } from "@/lib/alerts";
import Icon from "@/components/Icons";
import { Badge, Card } from "@/components/ui";
import AlertList from "@/components/AlertList";

/** Admin / Super Admin only. Streams in after the rest of the dashboard. */
export default async function AlertsCard({
  date,
  canReview,
  canEdit,
  canUnlock,
  canOpenEntry,
}: {
  date: string;
  canReview: boolean;
  canEdit: boolean;
  canUnlock: boolean;
  canOpenEntry: boolean;
}) {
  const alerts = await getAlerts(date);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${alerts.length ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
          <Icon name={alerts.length ? "alert" : "check"} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">Big changes in closing</h2>
          <p className="text-xs text-slate-500">Today&apos;s quantities that are 3× higher or 3× lower than the item&apos;s last closing</p>
        </div>
        {alerts.length > 0 && <Badge tone="amber">{alerts.length}</Badge>}
        {canReview && (
          <Link href="/closing" className="text-sm font-medium text-orange-600 hover:underline">
            Review all
          </Link>
        )}
      </div>

      {alerts.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nothing unusual found.</p>
      ) : (
        <AlertList
          alerts={alerts}
          limit={5}
          date={date}
          canEdit={canEdit}
          canUnlock={canUnlock}
          canOpenEntry={canOpenEntry}
        />
      )}
    </Card>
  );
}
