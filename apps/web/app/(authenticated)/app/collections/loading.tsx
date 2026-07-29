import { Skeleton } from "@talence/ui";

import { PageFrame } from "@/components/shell/page-frame";

export default function CollectionsLoading() {
  return (
    <PageFrame
      eyebrow="Workspace inventory"
      title="Loading collections"
      description="Reading workspace-scoped balances and immutable history."
    >
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </PageFrame>
  );
}
