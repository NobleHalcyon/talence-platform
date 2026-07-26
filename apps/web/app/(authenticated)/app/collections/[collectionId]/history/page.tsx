import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Collection history",
};

export default async function CollectionHistoryPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;

  return (
    <RoutePlaceholder
      eyebrow="Immutable ledger"
      title="Transaction history"
      description="Review actor, source, timing, deltas, safe references, and compensating reversal relationships."
      foundation="Committed history remains read-only. Authorized corrections create new reversal transactions instead of editing the past."
      resourceId={collectionId}
    />
  );
}
