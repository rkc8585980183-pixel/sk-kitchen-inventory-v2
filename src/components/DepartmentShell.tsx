import type { ReactNode } from "react";

/** Department users: no sidebar, full width. Each page draws its own header. */
export default function DepartmentShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50 pb-10">{children}</div>;
}
