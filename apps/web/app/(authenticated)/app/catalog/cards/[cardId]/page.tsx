import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Oracle card",
};

export default async function OracleCardPage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;

  return (
    <RoutePlaceholder
      eyebrow="Oracle identity"
      title="Card details"
      description="Rules identity, legalities, faces, printings, and ownership remain distinct and traceable."
      foundation="This detail shell will pair oracle-level information with a printing selector and collection ownership summary."
      resourceId={cardId}
    />
  );
}
