"use client";

import { Button, ErrorState } from "@talence/ui";

export default function DevicesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Devices could not be rendered"
      message="Nothing changed. Retry the authenticated device route safely."
      action={<Button onClick={reset}>Retry</Button>}
    />
  );
}
