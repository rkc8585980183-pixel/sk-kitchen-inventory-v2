"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import Icon, { type IconName } from "./Icons";
import Logo from "./Logo";

export interface Pill { icon: IconName; text: string; tone?: "ok" | "warn" | "bad" }

const BG = "#3C0618";

export interface DeptHeaderProps {
  deptName: string;
  userName: string;
  pills: Pill[];
  /* date bar props */
  date: string;
  min?: string;
  max: string;
  /* search + category (optional: only passed by InventoryForm, a client component) */
  search?: string;
  onSearch?: (v: string) => void;
  category?: string;
  categories?: string[];
  onCategory?: (v: string) => void;
  /* status (optional) */
  entered?: number;
  total?: number;
  statusEl?: React.ReactNode;
  saveStatusEl?: React.ReactNode;
}

export default function DeptHeader({
  deptName, userName, pills,
  date, min, max,
  search = "", onSearch, category = "all", categories = [], onCategory,
  entered = 0, total = 0, statusEl, saveStatusEl,
}: DeptHeaderProps) {
  const router = useRouter();
  const [pending, startNav] = useTransition();
  // date change is handled here (a function cannot be passed from a Server Component)
  const onDateChange = (d: string) => startNav(() => router.push(`/inventory?date=${d}`));
  const showTools = !!onSearch && !!onCategory;
  const [busy, setBusy] = useState(false);
  const [val, setVal] = useState(date);
  useEffect(() => setVal(date), [date]);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  /* pill tone colours */
  const pillCls = (t?: string) =>
    t === "bad" ? "bg-red-600/40 ring-red-300/40"
    : t === "warn" ? "bg-amber-400/30 ring-amber-100/40"
    : "bg-white/10 ring-white/20";

  const input = "h-7 rounded border border-white/20 bg-white/10 px-2 text-[11px] text-white placeholder:text-white/50 focus:border-white/50 focus:outline-none";

  return (
    <header style={{ background: BG }} className={cn("sticky top-0 z-40 text-white shadow-md", pending && "opacity-90")}>
      {/* ── row 1: brand · greeting · pills · user/signout ── */}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-5">
        {/* logo + brand */}
        <div className="flex shrink-0 items-center gap-2">
          <Logo size={30} className="rounded-md ring-1 ring-white/30" />
          <div className="leading-none">
            <p className="text-[11px] font-bold tracking-wide">SK KITCHEN</p>
            <p className="text-[9px] text-white/60">Inventory</p>
          </div>
        </div>

        {/* greeting */}
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold sm:text-sm">Hello, {deptName} Team 👋</span>
          <span className="ml-2 hidden text-[11px] text-white/60 sm:inline">— Update your closing stock</span>
        </div>

        {/* pills */}
        {pills.map((p, i) => (
          <span key={i} className={cn("hidden shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ring-1 md:inline-flex", pillCls(p.tone))}>
            <Icon name={p.icon} size={10} /> {p.text}
          </span>
        ))}

        {/* user + signout */}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-white/70 sm:block">{userName}</span>
          <button onClick={signOut} disabled={busy}
            className="inline-flex h-7 items-center gap-1 rounded bg-white/10 px-2.5 text-[11px] font-medium ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-50">
            <Icon name="logout" size={12} /> Sign out
          </button>
        </div>
      </div>

      {/* ── row 2: date picker · search · category · count + status ── */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-1.5 sm:px-5">
          {/* date input only – no Yesterday chip */}
          <div className="relative">
            <Icon name="calendar" size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="date"
              value={val}
              min={min}
              max={max}
              onChange={(e) => { setVal(e.target.value); if (e.target.value) onDateChange(e.target.value); }}
              className={cn(input, "pl-6 pr-1 w-36")}
            />
          </div>

          {/* divider */}
          <span className="hidden h-4 w-px bg-white/20 sm:block" />

          {showTools && (<>
          {/* search */}
          <div className="relative w-44">
            <Icon name="search" size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearch?.(e.target.value)}
              placeholder="Search item or code"
              className={cn(input, "pl-6 w-full")}
              aria-label="Search items"
            />
          </div>

          {/* category */}
          <select
            value={category}
            onChange={(e) => onCategory?.(e.target.value)}
            className={cn(input, "pr-6")}
            style={{ appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23fff' stroke-opacity='.5' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center", backgroundSize: "14px", paddingRight: "22px" }}
            aria-label="Category"
          >
            <option value="all" style={{ background: BG }}>All categories</option>
            {categories.map((c) => <option key={c} value={c} style={{ background: BG }}>{c}</option>)}
          </select>
          </>)}

          {/* spacer */}
          <div className="flex-1" />

          {/* count + status + autosave */}
          {showTools && (
          <div className="flex items-center gap-2 text-[11px] text-white/70">
            <span className="tabular-nums">{entered}/{total}</span>
            {statusEl}
            {saveStatusEl}
          </div>
          )}

          {/* legend (desktop only) */}
          <div className="hidden items-center gap-3 text-[10px] text-white/50 lg:flex">
            <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> Submitted</span>
            <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" /> Draft</span>
            <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full border border-white/30 bg-transparent" /> New</span>
          </div>
        </div>
      </div>
    </header>
  );
}
