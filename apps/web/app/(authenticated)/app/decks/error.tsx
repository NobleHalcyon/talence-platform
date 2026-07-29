"use client";

import { Button, ErrorState } from "@talence/ui";

export default function DecksError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Decks could not be rendered"
      message="Nothing changed. Retry the authenticated deck route safely."
      action={<Button onClick={reset}>Retry</Button>}
    />
  );
}
