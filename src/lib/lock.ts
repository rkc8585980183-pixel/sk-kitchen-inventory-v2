import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIST } from "@/lib/utils";

export interface EntryPolicy {
  /** How many days of entries are open, today included. null = no limit. 0 = fully locked */
  limitDays: number | null;
  /** Oldest date (YYYY-MM-DD) that can still be opened. null = no limit */
  cutoff: string | null;
  today: string;
  /** false until supabase/migrations/001_entry_lock.sql has been run */
  ready: boolean;
}

/** Days of entries the signed-in user may open (resolved in the database). */
export const getEntryPolicy = cache(async (): Promise<EntryPolicy> => {
  const supabase = await createClient();
  const today = todayIST();
  const { data, error } = await supabase.rpc("my_entry_window");
  if (error) return { limitDays: null, cutoff: null, today, ready: false };
  const limitDays = typeof data === "number" ? data : null;
  return {
    limitDays,
    // 1 day = today only, 2 days = today + yesterday, ...
    cutoff: limitDays === null ? null : addDays(today, -(limitDays - 1)),
    today,
    ready: true,
  };
});

/** A date can be opened if it is not in the future and not older than the allowed window. */
export function isPeriodOpen(policy: EntryPolicy, date: string) {
  return date <= policy.today && (policy.cutoff === null || date >= policy.cutoff);
}

export interface EntryTime {
  /** true when a time window applies to this user (department users only) */
  applies: boolean;
  isOpen: boolean;
  /** "HH:MM" India time */
  open: string | null;
  close: string | null;
}

/** Is the daily entry time window open right now for the signed-in user? */
export const getEntryTime = cache(async (): Promise<EntryTime> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_entry_time");
  if (error || !data) return { applies: false, isOpen: true, open: null, close: null };
  return {
    applies: !!data.applies,
    isOpen: data.is_open !== false,
    open: data.open_time ?? null,
    close: data.close_time ?? null,
  };
});
