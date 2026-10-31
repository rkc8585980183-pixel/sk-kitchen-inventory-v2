"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icons";
import { useToast } from "@/components/Toast";

export default function UnlockButton({
  departmentId,
  departmentName,
  date,
  currentStatus,
}: {
  departmentId: string;
  departmentName: string;
  date: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleUnlock() {
    const label =
      currentStatus === "time_locked" ? "Locked – Pending" : "Completed – Locked";
    if (
      !confirm(
        `Unlock "${departmentName}" entry (${label}) for ${date}?\n\nThe department will be able to edit and re-submit it.`
      )
    )
      return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/unlock-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: departmentId, date }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Could not unlock entry.", "error");
      } else {
        toast(`${departmentName} entry unlocked.`, "success");
        router.refresh();
      }
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleUnlock}
      disabled={loading}
      title="Unlock entry"
      aria-label={`Unlock ${departmentName}`}
      className="rounded-lg p-1.5 text-amber-500 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : (
        <Icon name="unlock" size={15} />
      )}
    </button>
  );
}
