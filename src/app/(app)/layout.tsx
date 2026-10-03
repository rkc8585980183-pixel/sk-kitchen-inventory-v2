import { getCurrentProfile } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import DepartmentShell from "@/components/DepartmentShell";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  return (
    <ToastProvider>
      {profile.role === "department_user" ? (
        <DepartmentShell>{children}</DepartmentShell>
      ) : (
        <AppShell profile={profile}>{children}</AppShell>
      )}
    </ToastProvider>
  );
}
