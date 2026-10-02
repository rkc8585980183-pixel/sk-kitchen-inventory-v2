import { Card, EmptyState } from "@/components/ui";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <Card>
      <EmptyState icon="lock" title="No pages are enabled for your account">
        Ask the Super Admin to give you access from the Permissions page.
      </EmptyState>
    </Card>
  );
}
