"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn, roleLabel } from "@/lib/utils";
import type { Profile } from "@/types";
import Icon, { type IconName } from "./Icons";
import { Avatar } from "./ui";
import { can, type PermKey } from "@/lib/permissions";
import Logo from "./Logo";

type Nav = { href: string; label: string; icon: IconName; perm?: PermKey; superOnly?: boolean };

const SECTIONS: { title: string; items: Nav[] }[] = [
  {
    title: "Work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", perm: "dashboard" },
      { href: "/inventory", label: "Inventory", icon: "inventory", perm: "inventory" },
      { href: "/closing", label: "Closing data", icon: "table", perm: "closing" },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: "reports", perm: "reports" },
      { href: "/trail", label: "Audit Trail", icon: "trail", perm: "trail" },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/items", label: "Items", icon: "items", perm: "items" },
      { href: "/mapping", label: "Mapping", icon: "mapping", perm: "mapping" },
      { href: "/users", label: "Users", icon: "users", perm: "users" },
      { href: "/departments", label: "Departments", icon: "departments", superOnly: true },
      { href: "/permissions", label: "Permissions", icon: "shield", superOnly: true },
      { href: "/settings", label: "Settings", icon: "sliders", superOnly: true },
    ],
  },
];

function SidebarContent({ profile, onNavigate }: { profile: Profile; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo size={36} className="shadow-lg shadow-black/30" />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">SK Kitchen</p>
          <p className="text-xs text-slate-400">Inventory</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {SECTIONS.map((s) => {
          const items = s.items.filter((n) => (n.superOnly ? profile.role === "super_admin" : n.perm ? can(profile, n.perm) : true));
          if (!items.length) return null;
          return (
            <div key={s.title}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.title}</p>
              <ul className="space-y-0.5">
                {items.map((n) => {
                  const active = pathname === n.href || pathname.startsWith(n.href + "/");
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                          active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        )}
                      >
                        {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-orange-500" />}
                        <Icon name={n.icon} size={18} className={active ? "text-orange-400" : "text-slate-500 group-hover:text-slate-300"} />
                        {n.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={profile.full_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{profile.full_name}</p>
            <p className="truncate text-xs text-slate-400">{roleLabel(profile.role)}</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-screen lg:flex">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-slate-900 lg:block">
        <SidebarContent profile={profile} />
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
          <Icon name="menu" size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Logo size={28} className="rounded-lg" />
          <span className="text-sm font-semibold text-slate-900">Kitchen Inventory</span>
        </div>
      </header>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-up bg-slate-900 shadow-pop">
            <SidebarContent profile={profile} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
