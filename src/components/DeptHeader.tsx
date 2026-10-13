"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Icon, { type IconName } from "./Icons";
import Logo from "./Logo";

export interface Pill { icon: IconName; text: string; tone?: "ok" | "warn" | "bad" }

const MAROON = "#3C0618";

export default function DeptHeader({ deptName, userName, pills }: { deptName: string; userName: string; pills: Pill[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header style={{ background: MAROON }} className="text-white shadow-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-5">
        {/* logo + brand */}
        <div className="order-1 flex shrink-0 items-center gap-2">
          <Logo size={32} className="rounded-lg ring-1 ring-white/30" />
          <div className="leading-none">
            <p className="text-xs font-bold tracking-wide">SK KITCHEN</p>
            <p className="text-[10px] text-white/60">Inventory</p>
          </div>
        </div>

        {/* greeting */}
        <div className="order-3 min-w-0 basis-full leading-none lg:order-2 lg:flex-1 lg:basis-auto">
          <span className="text-sm font-semibold">Hello, {deptName} Team 👋</span>
          <span className="ml-2 text-xs text-white/70">— Update your closing stock</span>
        </div>

        {/* pills */}
        {pills.length > 0 && (
          <div className="no-scrollbar order-4 flex basis-full gap-1.5 overflow-x-auto lg:order-3 lg:max-w-[38%] lg:basis-auto lg:overflow-visible">
            {pills.map((p, i) => (
              <span key={i} className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ring-1",
                p.tone === "bad" ? "bg-red-600/40 ring-red-300/40"
                  : p.tone === "warn" ? "bg-amber-400/30 ring-amber-100/40"
                  : "bg-white/10 ring-white/20"
              )}>
                <Icon name={p.icon} size={11} /> {p.text}
              </span>
            ))}
          </div>
        )}

        {/* user + sign out */}
        <div className="order-2 ml-auto flex items-center gap-2 lg:order-4">
          <span className="hidden text-xs text-white/75 sm:block">{userName}</span>
          <button
            onClick={signOut}
            disabled={busy}
            className="inline-flex h-7 items-center gap-1.5 rounded bg-white/10 px-2.5 text-xs font-medium ring-1 ring-white/20 transition hover:bg-white/20 disabled:opacity-50"
          >
            <Icon name="logout" size={13} /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
