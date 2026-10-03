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

/** Soft gradient header for the Department panel (blue + purple + orange/pink). */
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
    <header className="relative overflow-hidden bg-gradient-to-br from-sky-600 via-violet-600 to-fuchsia-600 text-white">
      <div className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full bg-sky-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 -top-16 h-72 w-72 rounded-full bg-orange-400/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-pink-400/30 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo size={44} className="rounded-xl ring-2 ring-white/40" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">SK Kitchen</p>
              <p className="text-xs text-white/75">Inventory</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-white/85 sm:block">{userName}</span>
            <button
              onClick={signOut}
              disabled={busy}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-white/15 px-3 text-sm font-medium ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25 disabled:opacity-60"
            >
              <Icon name="logout" size={16} /> Sign out
            </button>
          </div>
        </div>

        <h1 className="mt-7 text-2xl font-bold tracking-tight sm:text-3xl">Hello, {deptName} Team 👋</h1>
        <p className="mt-1 text-base text-white/85">Update your closing stock</p>

        {pills.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {pills.map((p, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 backdrop-blur",
                  p.tone === "bad" ? "bg-red-500/35 ring-red-200/40" : p.tone === "warn" ? "bg-amber-400/30 ring-amber-100/40" : "bg-white/15 ring-white/25"
                )}
              >
                <Icon name={p.icon} size={14} />
                {p.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
