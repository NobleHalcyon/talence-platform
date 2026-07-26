import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Set",
};

export default async function SetPage({ params }: { params: Promise<{ setCode: string }> }) {
  const { setCode } = await params;

  return (
    <RoutePlaceholder
      eyebrow="Catalog set"
      title="Set details"
      description="Browse a provider-backed release grouping with stable set identity and bounded printing results."
      foundation="Set metadata and results will remain admitted-user-only and read-only to human roles."
      resourceId={setCode}
    />
  );
}
