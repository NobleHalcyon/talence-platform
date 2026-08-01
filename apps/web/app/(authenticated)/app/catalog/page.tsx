import { CatalogPageState } from "@/components/catalog/catalog-page-state";
import { searchCatalog } from "@/features/catalog/data";
import { parseCatalogQuery } from "@/features/catalog/query";
import { loadDeckList } from "@/features/decks/data";

export const metadata = {
  title: "Catalog",
};

interface CatalogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CatalogPage({
  searchParams = Promise.resolve({}),
}: CatalogPageProps) {
  const parameters = await searchParams;
  const parsed = parseCatalogQuery(parameters, "grid");
  const [result, decks] = await Promise.all([searchCatalog(parsed.query), loadDeckList("active")]);
  const deckOptions = decks.ok
    ? decks.data.items
        .filter((deck) => deck.permissions.canEdit)
        .map((deck) => ({ id: deck.id, name: deck.name, currentRevision: deck.currentRevision }))
    : [];

  return <CatalogPageState parsed={parsed} result={result} deckOptions={deckOptions} />;
}
