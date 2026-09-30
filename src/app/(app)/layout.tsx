import { getCurrentProfile } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  return (
    <ToastProvider>
      <AppShell profile={profile}>{children}</AppShell>
    </ToastProvider>
  );
}
