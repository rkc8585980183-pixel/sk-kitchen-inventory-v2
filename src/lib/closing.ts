import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SCHEDULE, type ClosingMode, type ClosingSchedule } from "@/lib/closingSchedule";

/** The closing schedule configured by the Admin (Settings). OFF until the SQL update is run and a schedule is saved. */
export const getClosingSchedule = cache(async (): Promise<ClosingSchedule> => {
  const supabase = await createClient();
  const { data } = await supabase.from("lock_settings").select("*").eq("id", 1).maybeSingle();
  if (!data || !["daily", "weekly", "monthly"].includes(data.closing_mode)) return DEFAULT_SCHEDULE;
  return {
    mode: data.closing_mode as ClosingMode,
    time: String(data.closing_time ?? "23:00").slice(0, 5),
    weekday: Number(data.closing_weekday ?? 0),
    monthRule: data.closing_month_rule === "day" ? "day" : "month_end",
    monthDay: Number(data.closing_month_day ?? 1),
  };
});
