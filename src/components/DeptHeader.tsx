"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Icon, { type IconName } from "./Icons";
import Logo from "./Logo";

export interface Pill {
  icon: IconName;
  text: string;
  tone?: "ok" | "warn" | "bad";
}

/** Slim gradient header for the Department panel (blue + purple + orange/pink). */
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
    <header className="relative overflow-hidden bg-gradient-to-r from-sky-600 via-violet-600 to-fuchsia-600 text-white">
      <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-sky-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-8 -top-16 h-44 w-44 rounded-full bg-orange-400/40 blur-3xl" />

      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 sm:px-6">
        <div className="order-1 flex items-center gap-2.5">
          <Logo size={36} className="rounded-lg ring-2 ring-white/40" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">SK Kitchen</p>
            <p className="text-[11px] text-white/75">Inventory</p>
          </div>
        </div>

        <div className="order-3 basis-full leading-tight lg:order-2 lg:flex-1 lg:basis-auto lg:px-2">
          <h1 className="text-base font-bold tracking-tight sm:text-lg">Hello, {deptName} Team 👋</h1>
          <p className="text-xs text-white/85">Update your closing stock</p>
        </div>

        {pills.length > 0 && (
          <div className="no-scrollbar order-4 flex basis-full gap-1.5 overflow-x-auto lg:order-3 lg:max-w-[40%] lg:basis-auto lg:flex-wrap lg:overflow-visible">
            {pills.map((p, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 backdrop-blur",
                  p.tone === "bad" ? "bg-red-500/35 ring-red-200/40" : p.tone === "warn" ? "bg-amber-400/30 ring-amber-100/40" : "bg-white/15 ring-white/25"
                )}
              >
                <Icon name={p.icon} size={12} />
                {p.text}
              </span>
            ))}
          </div>
        )}

        <div className="order-2 ml-auto flex items-center gap-2 lg:order-4">
          <span className="hidden text-sm text-white/85 sm:block">{userName}</span>
          <button
            onClick={signOut}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/15 px-2.5 text-xs font-medium ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25 disabled:opacity-60"
          >
            <Icon name="logout" size={14} /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
