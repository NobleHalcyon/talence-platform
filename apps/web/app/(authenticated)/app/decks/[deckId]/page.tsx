import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Deck editor",
};

export default async function DeckEditorPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;

  return (
    <RoutePlaceholder
      eyebrow="Deck editor"
      title="Build with ownership context"
      description="Catalog search, deck zones, ownership, valuation, and deterministic validation stay available without drag-only interactions."
      foundation="Wide screens will use search, deck, and analysis regions. Compact screens will expose the same actions through tabbed or stacked surfaces."
      resourceId={deckId}
    />
  );
}
