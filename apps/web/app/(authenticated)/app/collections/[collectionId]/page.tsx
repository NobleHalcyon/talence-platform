import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Collection",
};

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;

  return (
    <RoutePlaceholder
      eyebrow="Collection inventory"
      title="Collection details"
      description="Structured, gallery, and analytical views will reconcile against the same materialized balances."
      foundation="Every add, edit, remove, transfer, and reversal will call an atomic transaction function rather than writing balances directly."
      resourceId={collectionId}
    />
  );
}
