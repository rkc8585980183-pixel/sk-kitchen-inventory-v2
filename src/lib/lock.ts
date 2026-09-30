import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIST } from "@/lib/utils";

export interface EntryPolicy {
  /** null = no limit */
  limitDays: number | null;
  /** oldest week_end that can still be opened (YYYY-MM-DD). null = no limit */
  cutoff: string | null;
  /** false until supabase/migrations/001_entry_lock.sql has been run */
  ready: boolean;
}

/** How many days back the signed-in user may open entries (resolved in the database). */
export const getEntryPolicy = cache(async (): Promise<EntryPolicy> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_entry_window");
  if (error) return { limitDays: null, cutoff: null, ready: false };
  const limitDays = typeof data === "number" ? data : null;
  return {
    limitDays,
    cutoff: limitDays === null ? null : addDays(todayIST(), -limitDays),
    ready: true,
  };
});

export function isPeriodOpen(policy: EntryPolicy, weekEnd: string) {
  return policy.cutoff === null || weekEnd >= policy.cutoff;
}
