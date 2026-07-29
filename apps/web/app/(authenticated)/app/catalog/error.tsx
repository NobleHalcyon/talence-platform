"use client";

import { Button, ErrorState } from "@talence/ui";

import { PageFrame } from "@/components/shell/page-frame";

export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageFrame
      eyebrow="MTG catalog"
      title="Catalog"
      description="Authenticated catalog browsing and exact printing details."
    >
      <ErrorState
        title="The catalog page could not render"
        message={`Nothing changed. Retry this page. Support reference: ${error.digest ?? "not available"}`}
        action={<Button onClick={reset}>Retry</Button>}
      />
    </PageFrame>
  );
}
