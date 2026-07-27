import { CatalogPageState } from "@/components/catalog/catalog-page-state";
import { PageFrame } from "@/components/shell/page-frame";
import { loadCatalogViewPreference, searchCatalog } from "@/features/catalog/data";
import { parseCatalogQuery } from "@/features/catalog/query";

export const metadata = {
  title: "Catalog",
};

interface CatalogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CatalogPage({
  searchParams = Promise.resolve({}),
}: CatalogPageProps) {
  const [parameters, preferredView] = await Promise.all([
    searchParams,
    loadCatalogViewPreference(),
  ]);
  const parsed = parseCatalogQuery(parameters, preferredView);
  const result = await searchCatalog(parsed.query);

  return (
    <PageFrame
      eyebrow="MTG catalog"
      title="Browse exact printings"
      description="Search Talence’s admitted-user catalog. Results come from the active PostgreSQL import, never a live browser request to the provider."
    >
      <CatalogPageState parsed={parsed} result={result} />
    </PageFrame>
  );
}
