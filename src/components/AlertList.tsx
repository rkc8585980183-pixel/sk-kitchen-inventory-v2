"use client";

import { useState } from "react";
import type { QtyAlert } from "@/lib/alerts";
import { AlertDialog, AlertRow } from "./AlertDialog";

export default function AlertList({
  alerts,
  date,
  limit = 5,
  canEdit,
  canUnlock,
  canOpenEntry,
}: {
  alerts: QtyAlert[];
  date: string;
  limit?: number;
  canEdit: boolean;
  canUnlock: boolean;
  canOpenEntry: boolean;
}) {
  const [active, setActive] = useState<QtyAlert | null>(null);
  return (
    <>
      <ul className="mt-3 divide-y divide-slate-100">
        {alerts.slice(0, limit).map((a) => (
          <li key={a.departmentId + a.itemId}>
            <AlertRow a={a} onOpen={setActive} />
          </li>
        ))}
        {alerts.length > limit && <li className="px-3 py-2.5 text-xs text-slate-500">and {alerts.length - limit} more. Open Closing data to see all.</li>}
      </ul>
      <AlertDialog alert={active} date={date} canEdit={canEdit} canUnlock={canUnlock} canOpenEntry={canOpenEntry} onClose={() => setActive(null)} />
    </>
  );
}
