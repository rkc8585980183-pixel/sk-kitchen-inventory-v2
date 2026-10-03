import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { todayIST } from "@/lib/utils";
import SettingsClient from "./SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "super_admin") redirect("/dashboard");
  const supabase = await createClient();

  const [settings, departments, admins] = await Promise.all([
    supabase.from("lock_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("departments").select("*").order("name"),
    supabase.from("profiles").select("*").eq("role", "admin").order("full_name"),
  ]);

  return (
    <SettingsClient
      ready={!!settings.data}
      today={todayIST()}
      closing={{
        mode: settings.data?.closing_mode ?? "off",
        time: String(settings.data?.closing_time ?? "23:00").slice(0, 5),
        weekday: settings.data?.closing_weekday ?? 0,
        monthRule: settings.data?.closing_month_rule ?? "month_end",
        monthDay: settings.data?.closing_month_day ?? 1,
      }}
      time={{
        enabled: settings.data?.time_lock_enabled ?? false,
        open: String(settings.data?.entry_open_time ?? "00:00").slice(0, 5),
        close: String(settings.data?.entry_close_time ?? "23:59").slice(0, 5),
      }}
      settings={{
        enabled: settings.data?.enabled ?? true,
        default_department_days: settings.data?.default_department_days ?? 7,
        default_admin_days: settings.data?.default_admin_days ?? 30,
      }}
      departments={(departments.data ?? []).map((d) => ({ id: d.id, name: d.name, sub: d.code, back_days: d.back_days ?? null, active: d.is_active }))}
      admins={(admins.data ?? []).map((a) => ({ id: a.id, name: a.full_name, sub: a.email, back_days: a.back_days ?? null, active: a.is_active }))}
    />
  );
}
