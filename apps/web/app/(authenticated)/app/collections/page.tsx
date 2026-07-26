import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Collections",
};

export default function CollectionsPage() {
  return (
    <RoutePlaceholder
      eyebrow="Workspace inventory"
      title="Collections"
      description="Named, private inventory containers scoped to the active workspace."
      foundation="Collection creation, archive/restore behavior, summaries, and default source selection will compose shared primitives and transactional server actions."
    />
  );
}
