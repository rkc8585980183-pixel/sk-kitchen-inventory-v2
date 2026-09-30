"use client";

import { Button, Card, EmptyState } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState icon="alert" title="Something went wrong">
        <p>{error.message || "Unexpected error."} Please try again.</p>
        <div className="mt-5">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </div>
      </EmptyState>
    </Card>
  );
}
