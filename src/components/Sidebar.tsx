"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", roles: ["super_admin", "admin", "department_user"] },
  { href: "/inventory", label: "Inventory", roles: ["super_admin", "admin", "department_user"] },
  { href: "/reports", label: "Reports", roles: ["super_admin", "admin"] },
  { href: "/trail", label: "Trail", roles: ["super_admin", "admin"] },
  { href: "/items", label: "Items", roles: ["super_admin", "admin"] },
  { href: "/mapping", label: "Mapping", roles: ["super_admin", "admin"] },
  { href: "/departments", label: "Departments", roles: ["super_admin"] },
  { href: "/users", label: "Users", roles: ["super_admin", "admin"] },
];

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-gray-100 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
          SK
        </div>
        <span className="font-semibold text-gray-900 text-sm">Kitchen Inventory</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.filter((n) => n.roles.includes(profile.role)).map((n) => {
          const active = pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                active
                  ? "bg-orange-50 text-orange-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-sm font-medium text-gray-900">{profile.full_name}</p>
        <p className="text-xs text-gray-500 capitalize">{profile.role.replace("_", " ")}</p>
        <button
          onClick={handleLogout}
          className="mt-3 w-full text-xs font-medium text-red-600 border border-red-200 rounded-lg py-1.5 hover:bg-red-50"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
