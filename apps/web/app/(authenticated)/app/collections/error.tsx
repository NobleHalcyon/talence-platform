"use client";

import { Button, ErrorState } from "@talence/ui";

export default function CollectionsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Collection route failed"
      message="Nothing changed. Retry the read safely; if it repeats, use the request ID shown by the route."
      action={
        <Button variant="secondary" onClick={reset}>
          Retry
        </Button>
      }
    />
  );
}
