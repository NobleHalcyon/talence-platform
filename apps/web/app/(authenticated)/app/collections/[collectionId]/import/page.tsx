import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Import collection",
};

export default async function CollectionImportPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;

  return (
    <RoutePlaceholder
      eyebrow="Staged CSV workflow"
      title="Import inventory"
      description="Upload, resolve, review, and commit a bounded import without silently accepting ambiguous card matches."
      foundation="The staged preview will separate matched, ambiguous, and rejected rows before one idempotent inventory transaction is committed."
      resourceId={collectionId}
      constrained
    />
  );
}
