import { redirect } from "next/navigation";

// Old address: everything now lives on the Settings page.
export default function EntryLockRedirect() {
  redirect("/settings");
}
