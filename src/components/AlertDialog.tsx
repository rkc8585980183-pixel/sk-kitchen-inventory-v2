"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ratioText, type QtyAlert } from "@/lib/alertTypes";
import { cn, fmtDay, fmtWeekday } from "@/lib/utils";
import Icon from "./Icons";
import Modal from "./Modal";
import { useToast } from "./Toast";
import { Badge, Button, buttonCls, inputCls, StatusBadge } from "./ui";

/** One clickable line of the "Big changes" list. */
export function AlertRow({ a, onOpen }: { a: QtyAlert; onOpen: (a: QtyAlert) => void }) {
  return (
    <button
      onClick={() => onOpen(a)}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-slate-50"
    >
      <span className="font-medium text-slate-900">{a.itemName}</span>
      <span className="text-slate-500">{a.departmentName}</span>
      <span className="ml-auto flex items-center gap-2 text-slate-700">
        <span className="tabular-nums">
          {a.previous} → <b>{a.quantity}</b> {a.unit}
        </span>
        <Badge tone="amber">{ratioText(a)}</Badge>
      </span>
    </button>
  );
}

/**
 * Opens when a big change is clicked: compare with the last closing, open the item's entry,
 * correct the quantity (closing_edit), or reopen the entry for the department (entries_unlock).
 */
export function AlertDialog({
  alert,
  date,
  canEdit,
  canUnlock,
  canOpenEntry,
  onClose,
}: {
  alert: QtyAlert | null;
  date: string;
  canEdit: boolean;
  canUnlock: boolean;
  canOpenEntry: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"save" | "unlock" | null>(null);

  useEffect(() => {
    setQty(alert ? String(alert.quantity) : "");
    setReason("");
  }, [alert]);

  function friendly(msg: string) {
    if (msg.includes("PERMISSION_DENIED")) return "You do not have permission for this action.";
    if (msg.includes("ENTRY_LOCKED")) return "This date is locked for your account.";
    if (msg.includes("admin_save_entries")) return "Database update pending. Run the latest 001_entry_lock.sql in Supabase.";
    return msg;
  }

  async function save() {
    if (!alert) return;
    const q = qty === "" ? null : parseFloat(qty);
    if (q !== null && (!Number.isFinite(q) || q < 0)) return toast("Enter a valid quantity (0 or more).", "error");
    setBusy("save");
    const { error } = await supabase.rpc("admin_save_entries", {
      p_department_id: alert.departmentId,
      p_date: date,
      p_rows: [{ item_id: alert.itemId, quantity: q }],
    });
    setBusy(null);
    if (error) return toast(friendly(error.message), "error");
    toast("Quantity updated.");
    onClose();
    router.refresh();
  }

  async function unlock() {
    if (!alert) return;
    setBusy("unlock");
    const { error } = await supabase.rpc("unlock_inventory", { p_period_id: alert.periodId, p_reason: reason.trim() });
    setBusy(null);
    if (error) return toast(friendly(error.message), "error");
    toast(`${alert.departmentName} entry opened for editing.`);
    onClose();
    router.refresh();
  }

  const a = alert;

  return (
    <Modal open={!!a} onClose={onClose} title={a ? `${a.itemName} · ${a.departmentName}` : ""} size="md">
      {a && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{fmtWeekday(date)}</span>
            <StatusBadge status={a.status} />
            <Badge tone="amber" dot>
              Big change · {ratioText(a)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Last closing · {fmtDay(a.previousDate, true)}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {a.previous} <span className="text-sm font-medium uppercase text-slate-500">{a.unit}</span>
              </p>
            </div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">This closing</p>
              <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-amber-900">
                {a.quantity} <span className="text-sm font-medium uppercase text-amber-800">{a.unit}</span>
                <Icon name="alert" size={18} className="text-amber-600" />
              </p>
            </div>
          </div>

          {canOpenEntry && (
            <Link href={`/inventory?department=${a.departmentId}&date=${date}&item=${a.itemId}`} className={buttonCls("secondary", "md", "w-full")}>
              <Icon name="inventory" size={16} /> Open this item&apos;s entry
            </Link>
          )}

          {canEdit && (
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-900">Correct the quantity</p>
              <p className="mt-0.5 text-xs text-slate-500">Works even if the department already submitted.</p>
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={cn(inputCls, "text-right tabular-nums")}
                  aria-label="Correct quantity"
                />
                <Button variant="primary" loading={busy === "save"} onClick={save}>
                  Save
                </Button>
              </div>
            </div>
          )}

          {a.status === "submitted" && canUnlock ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <p className="text-sm font-medium text-slate-900">Open for the department</p>
              <p className="mt-0.5 text-xs text-slate-500">The department can then correct the entry and submit again.</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason (saved in the audit trail)"
                className={cn(inputCls, "mt-3 h-auto py-2")}
              />
              <div className="mt-3">
                <Button variant="warning" icon="unlock" loading={busy === "unlock"} onClick={unlock}>
                  Open entry for department
                </Button>
              </div>
            </div>
          ) : (
            a.status !== "submitted" && <p className="text-xs text-slate-500">This entry is still open: the department can change it.</p>
          )}
        </>
      )}
    </Modal>
  );
}

export default AlertDialog;
