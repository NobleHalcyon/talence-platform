"use client";

import { Button, ErrorState } from "@talence/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="This view could not be loaded"
      message={`Nothing was changed. Try the request again.${
        error.digest ? ` Request reference: ${error.digest}` : ""
      }`}
      action={
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
