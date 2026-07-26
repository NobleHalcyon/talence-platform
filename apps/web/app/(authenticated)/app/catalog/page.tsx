import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Catalog",
};

export default function CatalogPage() {
  return (
    <RoutePlaceholder
      eyebrow="MTG catalog"
      title="Browse exact printings"
      description="Search and filter Talence’s ingested catalog without sending ordinary browser searches to a provider."
      foundation="The full-width table and grid surfaces will use URL-addressable filters, bounded cursor pagination, deterministic ordering, and visible catalog freshness."
    />
  );
}
