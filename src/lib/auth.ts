import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types";

/**
 * Cached per request: layout + page share ONE profile lookup.
 * getClaims() verifies the JWT locally (no extra network round-trip to Supabase Auth
 * when the project uses asymmetric signing keys).
 */
export const getCurrentProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", uid).single();
  if (!profile) redirect("/login?e=noprofile");
  if (profile.is_active === false) redirect("/login?e=inactive");
  return profile as Profile;
});

export function isAdmin(role: string) {
  return role === "admin" || role === "super_admin";
}
