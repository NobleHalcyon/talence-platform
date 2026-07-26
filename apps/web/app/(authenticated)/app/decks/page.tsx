import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Decks",
};

export default function DecksPage() {
  return (
    <RoutePlaceholder
      eyebrow="Workspace decks"
      title="Decks"
      description="Oracle-level deck requirements connected to selected collection inventory sources."
      foundation="Deck creation, duplication, archive/restore, format selection, covers, notes, and tags will remain workspace-scoped."
    />
  );
}
